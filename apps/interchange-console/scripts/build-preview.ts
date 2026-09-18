// ─────────────────────────────────────────────────────────────────────────────
// Build the public preview gallery from a REAL bureau capture, anonymised.
//
//   npx tsx scripts/build-preview.ts --raw <dir> [--raw <another dir>]
//
// More than one --raw may be given. Captures accumulate across sessions — the
// 15 Sep pull answered reports 3, 8, 11, 12 and 16; the 18 Sep pull answered
// 1, 2, 5, 6, 10, 13 and 14 — and merging the directories on disk would throw
// away the date each answer was true on. Where two directories hold the same
// report type, the NEWER capture wins.
//
// Writes public/preview/samples/** and public/preview/manifest.json.
//
// The raw directory holds a real person's credit file and lives OUTSIDE this
// repo (reports/crb is git-ignored). Nothing from it is written anywhere until
// it has been anonymised, and nothing is kept unless the leak scan passes over
// every file. A single hit deletes the whole output and fails the build.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { pathToFileURL } from "url";
import { tmpdir } from "os";
import { buildFile } from "../lib/reports/bureau";
import { bureauDocument } from "../lib/reports/documents";
import { renderReportHtml, resolveMeta } from "../lib/reports/shell";
import { htmlToPdf, fontsLanded, pageCount, chromiumPath } from "../lib/reports/render";
import { bureauEnvelope, accountsCsv, type BureauResponseRef } from "../lib/reports/envelope";
import { documentReference, eatTimestamp, sha256 } from "../lib/reports/reference";
import { BUREAU_REPORT_TYPES, bureauReportType } from "../lib/codes/metropol";
import { harvest, anonymisePayload, scan, SAMPLE_PERSON, type Leak } from "../lib/preview/anonymise";

const run = promisify(execFile);
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Payload = { [k: string]: Json };

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Every value given for a repeated flag, in the order they appeared. */
const args = (name: string) => {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) out.push(process.argv[i + 1]);
  });
  return out;
};

const OUT = resolve("public/preview");
const SAMPLES = join(OUT, "samples");

const REQUESTED_BY = { person: "Sample Analyst", organisation: "Sample Lender Limited", memberCode: "KE/LENDER/SAMPLE" };

/** How each bureau product is represented in the gallery. */
type Plan =
  | { type: number; kind: "captured"; from: number }
  | { type: number; kind: "section"; from: number; pick: (p: Payload) => Payload }
  | { type: number; kind: "needs_pull" | "described" | "refused" };

// Reports 1, 2, 5, 6, 10, 13 and 14 were pulled standalone on 18 Sep 2026 under
// the founder's approval, so they are no longer shown as sections of report 12
// or as "needs a pull".
//
// That change was worth the money. A standalone report 1 returns citizenship,
// clan, ethnic group, occupation, place of birth, registration office and slots
// for photo, fingerprint and signature — none of which appear in the identity
// block nested inside report 12. Showing the nested block and calling it
// "Identity Verification" understated the product by about two thirds.
const PLAN: Plan[] = [
  { type: 1, kind: "captured", from: 1 },
  { type: 2, kind: "captured", from: 2 },
  { type: 3, kind: "captured", from: 3 },
  { type: 4, kind: "described" },
  { type: 5, kind: "captured", from: 5 },
  { type: 6, kind: "captured", from: 6 },
  { type: 8, kind: "captured", from: 8 },
  { type: 10, kind: "captured", from: 10 },
  { type: 11, kind: "captured", from: 11 },
  { type: 12, kind: "captured", from: 12 },
  { type: 13, kind: "captured", from: 13 },
  { type: 14, kind: "captured", from: 14 },
  { type: 16, kind: "captured", from: 16 },
  { type: 22, kind: "refused" },
];

type Capture = { reportType: number; payload: Payload; capture: "wire" | "unwrapped"; capturedAt: Date };

function loadRaw(dir: string): Capture[] {
  const out: Capture[] = [];
  for (const f of readdirSync(dir)) {
    const m = f.match(/^report-(\d+)(\.wire)?\.json$/);
    if (!m) continue;
    const parsed = JSON.parse(readFileSync(join(dir, f), "utf8")) as Payload;
    const wrapped = parsed.json && typeof parsed.json === "object" && !Array.isArray(parsed.json);
    out.push({
      reportType: Number(m[1]),
      payload: wrapped ? (parsed.json as Payload) : parsed,
      capture: m[2] ? "wire" : "unwrapped",
      capturedAt: statSync(join(dir, f)).mtime,
    });
  }
  return out.sort((a, b) => a.reportType - b.reportType);
}

const ACCOUNT_PRODUCTS = new Set([5, 8, 10, 11, 12, 14]);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function thumbnail(htmlPath: string, pngPath: string) {
  const browser = chromiumPath();
  if (!browser) return false;
  await run(
    browser,
    [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--no-first-run",
      "--window-size=794,1123", "--virtual-time-budget=3000", "--force-device-scale-factor=1",
      `--user-data-dir=${join(tmpdir(), "interchange-thumb-profile")}`,
      `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href,
    ],
    { timeout: 60_000, windowsHide: true },
  );
  return existsSync(pngPath);
}

type FileEntry = { path: string; bytes: number; sha256: string; pages?: number };

async function main() {
  const rawDirs = args("raw");
  if (!rawDirs.length) throw new Error("Give at least one capture directory: --raw <dir>");

  // Newest capture of each report type wins, so re-pulling a report to get a
  // fresher answer needs no file shuffling — just another --raw.
  const merged = new Map<number, Capture>();
  for (const dir of rawDirs) {
    const found = loadRaw(resolve(dir));
    if (!found.length) throw new Error(`No report-<N>.json captures in ${dir}`);
    for (const c of found) {
      const seen = merged.get(c.reportType);
      if (!seen || c.capturedAt > seen.capturedAt) merged.set(c.reportType, c);
    }
    console.log(`  raw: ${dir} — reports ${found.map((f) => f.reportType).join(", ")}`);
  }
  const captures = [...merged.values()].sort((a, b) => a.reportType - b.reportType);

  // 1. Harvest every identifying value from EVERY capture, before anything else.
  const h = harvest(captures.map((c) => c.payload));
  console.log(
    `\n\x1b[1mHarvested\x1b[0m ${h.idNumbers.size} ID · ${h.nameTokens.size} name tokens · ${h.phones.size} phone · ` +
      `${h.accountNumbers.size} account numbers · ${h.trxIds.size} trx ids · ${h.places.size} places · ${h.dates.size} dates`,
  );

  // 2. Anonymise.
  const anon = captures.map((c) => ({ ...c, payload: anonymisePayload(c.payload, h) }));
  const byType = new Map(anon.map((c) => [c.reportType, c]));

  // Only this script's own output. public/preview/crunch belongs to build-crunch-demo.
  rmSync(SAMPLES, { recursive: true, force: true });
  rmSync(join(OUT, "manifest.json"), { force: true });
  mkdirSync(SAMPLES, { recursive: true });

  const written: { path: string; content: string | Buffer }[] = [];
  const write = (rel: string, content: string | Buffer): FileEntry => {
    const abs = join(OUT, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
    written.push({ path: rel, content });
    return { path: `/preview/${rel.replace(/\\/g, "/")}`, bytes: Buffer.byteLength(content), sha256: sha256(content) };
  };

  const products: Record<string, unknown>[] = [];

  for (const plan of PLAN) {
    const def = bureauReportType(plan.type)!;
    const base = { type: plan.type, name: def.name, answers: def.answers, contains: def.contains, entitled: def.entitled };

    if (!("from" in plan)) {
      products.push({ ...base, status: plan.kind });
      continue;
    }

    const src = byType.get(plan.from);
    if (!src) {
      products.push({ ...base, status: "needs_pull", note: `No capture of report ${plan.from} in the raw directory.` });
      continue;
    }

    const payload = plan.kind === "section" ? plan.pick(src.payload) : src.payload;
    // A section is folded as the report it came from, so nested shapes unwrap correctly.
    const file = buildFile([{ reportType: plan.kind === "section" ? plan.from : plan.type, payload: plan.kind === "section" ? src.payload : payload }]);
    file.sources = plan.kind === "section" ? [plan.from] : [plan.type];

    const reportDate = eatTimestamp(src.capturedAt);
    const reference = documentReference(`interchange-sample|report-${plan.type}|${SAMPLE_PERSON.idNumber}`, src.capturedAt);
    const responses: BureauResponseRef[] = [
      {
        report_type: plan.from,
        sha256: sha256(JSON.stringify(payload)),
        capture: src.capture,
        ...(plan.kind === "section" ? { section_of: plan.from } : {}),
      },
    ];

    const { envelope, contentDigest } = bureauEnvelope({
      type: plan.type,
      file,
      reference,
      reportDate,
      requestedBy: REQUESTED_BY,
      responses,
      sample: true,
    });

    const doc = bureauDocument(
      plan.type,
      file,
      {
        member: { code: REQUESTED_BY.memberCode, name: REQUESTED_BY.organisation },
        subjectToken: sha256(`sample|${SAMPLE_PERSON.idNumber}`),
        consentRef: "CN-SAMPLE",
        generatedAt: eatTimestamp(),
        requestedBy: REQUESTED_BY,
        reference,
        reportDate,
        contentDigest,
        sample: true,
        source:
          plan.kind === "section"
            ? `Metropol CRB · section of the report ${plan.from} answer`
            : `Metropol CRB · report ${plan.type}`,
      },
      {
        section: plan.kind === "section" ? { of: plan.from } : null,
        loanAmount: plan.type === 2 ? 8000 : null,
      },
    );
    const html = renderReportHtml(doc);
    const m = resolveMeta(doc.meta);
    if (m.reference !== reference) throw new Error("reference drifted between envelope and document");

    const name = `${slug(def.name)}-${reference}`;
    const dir = `samples/report-${plan.type}`;
    const files: Record<string, FileEntry> = {};

    files.html = write(`${dir}/${name}.html`, html);
    files.json = write(`${dir}/${name}.json`, JSON.stringify(envelope, null, 2) + "\n");
    files.bureau = write(`${dir}/${name}.metropol-${plan.from}${plan.kind === "section" ? "-section" : ""}.json`, JSON.stringify(payload, null, 2) + "\n");
    // The account ladder belongs to the account products only. Identity products
    // fold the whole report 12 answer to read their section, but sell no accounts.
    if (ACCOUNT_PRODUCTS.has(plan.type) && file.accounts.length) files.csv = write(`${dir}/${name}-accounts.csv`, accountsCsv(file));

    if (chromiumPath()) {
      const pdf = await htmlToPdf(html);
      const fonts = fontsLanded(pdf);
      if (!fonts.ok) throw new Error(`Report ${plan.type} PDF fell back to system faces: ${fonts.fonts.join(", ")}`);
      files.pdf = { ...write(`${dir}/${name}.pdf`, pdf), pages: pageCount(pdf) ?? undefined };
      const png = join(OUT, dir, `${name}.png`);
      if (await thumbnail(join(OUT, files.html.path.replace("/preview/", "")), png)) {
        const buf = readFileSync(png);
        files.thumb = { path: `/preview/${dir}/${name}.png`, bytes: buf.length, sha256: sha256(buf) };
      }
    }

    products.push({
      ...base,
      status: plan.kind,
      ...(plan.kind === "section" ? { sectionOf: plan.from } : {}),
      capture: src.capture,
      reference,
      reportDate,
      contentDigest,
      accounts: file.accounts.length,
      files,
    });
    console.log(`  report ${String(plan.type).padStart(2)}  ${plan.kind.padEnd(8)} ${reference}  ${Object.keys(files).join(" ")}${files.pdf?.pages ? `  ${files.pdf.pages}p` : ""}`);
  }

  // 3. Scan every byte written. Binary files (PDF) are compressed, so short
  //    needles can match by chance; only needles of six characters or more are
  //    meaningful there. Their text layer is the HTML, which is scanned in full.
  const leaks: Leak[] = [];
  for (const w of written) {
    const found = scan(w.path, w.content, h);
    leaks.push(...(typeof w.content === "string" ? found : found.filter((l) => l.value.length >= 6)));
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    person: { name: SAMPLE_PERSON.names.join(" "), idNumber: SAMPLE_PERSON.idNumber },
    requestedBy: REQUESTED_BY,
    leakScan: { files: written.length, leaks: leaks.length },
    catalogue: BUREAU_REPORT_TYPES.map((r) => r.type),
    products,
  };

  leaks.push(...scan("manifest.json", JSON.stringify(manifest), h));

  if (leaks.length) {
    rmSync(SAMPLES, { recursive: true, force: true });
    console.error(`\n\x1b[31m✗ ${leaks.length} leak(s). Nothing was kept.\x1b[0m`);
    for (const l of leaks.slice(0, 20)) console.error(`  ${l.what.padEnd(16)} in ${l.where}`);
    process.exit(1);
  }

  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n\x1b[32m✓\x1b[0m ${written.length} files, leak scan clean · public/preview/manifest.json\n`);
}

main().catch((e) => {
  console.error(`\n\x1b[31m${e instanceof Error ? e.stack ?? e.message : String(e)}\x1b[0m\n`);
  process.exit(1);
});
