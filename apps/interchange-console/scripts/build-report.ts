// ─────────────────────────────────────────────────────────────────────────────
// Render a report from raw Metropol JSON on disk, and prove it rendered.
//
//   npx tsx scripts/build-report.ts --raw <dir> --out <file.pdf> [--member KE/LENDER/3005]
//
// `--raw` is a directory of bureau answers. Two layouts are understood:
//   · report-<N>.json         — the wire body, as Metropol sent it
//   · report-<N>.wire.json    — same
//   · a pullSingleReport() result, where the body sits under `.json`
//
// ── WHY A SCRIPT AND NOT A TEST ──────────────────────────────────────────────
// The thing that goes wrong with a generated document is never caught by an
// assertion on its data — it is a chart that overflows its box, a table that
// breaks across a page badly, or a font that silently fell back to Times. Those
// are found by rendering the real thing and LOOKING at it. This makes that one
// command, so it is cheap enough to do on every change.
//
// It writes the HTML beside the PDF deliberately: when something looks wrong,
// the HTML is what you open in a browser to find out why.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { buildFile, totals } from "../lib/reports/bureau";
import { bureauCreditFile } from "../lib/reports/documents";
import { renderReportHtml } from "../lib/reports/shell";
import { htmlToPdf, fontsLanded, pageCount, chromiumPath } from "../lib/reports/render";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};

function loadRaw(dir: string): { reportType: number; payload: Record<string, unknown> }[] {
  const parts: { reportType: number; payload: Record<string, unknown> }[] = [];
  for (const f of readdirSync(dir)) {
    const m = f.match(/report-(\d+)(?:\.wire)?\.json$/);
    if (!m) continue;
    const parsed = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
    // A pullSingleReport() result wraps the bureau's body; a wire capture is the
    // body itself. `ok` plus `json` is the reliable tell.
    const payload =
      parsed.json && typeof parsed.json === "object" ? (parsed.json as Record<string, unknown>) : parsed;
    parts.push({ reportType: Number(m[1]), payload });
  }
  return parts.sort((a, b) => a.reportType - b.reportType);
}

async function main() {
  const rawDir = resolve(arg("raw") ?? "");
  const out = resolve(arg("out") ?? "report.pdf");
  const memberCode = arg("member", "KE/LENDER/3005")!;
  const memberName = arg("member-name", "Micromart Fintech")!;

  if (!rawDir) throw new Error("Give me a directory of bureau JSON: --raw <dir>");

  const parts = loadRaw(rawDir);
  if (parts.length === 0) throw new Error(`No report-<N>.json files in ${rawDir}`);

  const file = buildFile(parts);
  const t = totals(file);
  console.log(`\n\x1b[1mBureau file\x1b[0m — reports ${file.sources.join(", ")} · ${t.accounts} accounts · ` +
    `${t.live} live · KES ${Math.round(t.outstanding).toLocaleString()} outstanding`);
  if (file.notes.length) for (const n of file.notes) console.log(`  \x1b[2m· ${n}\x1b[0m`);

  const doc = bureauCreditFile(file, {
    member: { code: memberCode, name: memberName },
    // The subject token is derived by the node in the real path. Rendering from
    // disk has no Registry, so the file's own identity number is hashed to a
    // stable stand-in — and it is LABELLED as one rather than passed off.
    subjectToken: `local-render-${(file.identity.identityNumber ?? "unknown").replace(/\D/g, "").slice(-4).padStart(4, "0")}`.padEnd(24, "0"),
    consentRef: null,
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
    environment: "LOCAL RENDER",
    source: `Metropol CRB · reports ${file.sources.join(", ")}`,
  });

  const html = renderReportHtml(doc);
  mkdirSync(dirname(out), { recursive: true });
  const htmlPath = out.replace(/\.pdf$/, ".html");
  writeFileSync(htmlPath, html, "utf8");
  console.log(`\n  html   ${htmlPath}  ${(html.length / 1024).toFixed(0)}KB`);

  if (!chromiumPath()) {
    console.log("  \x1b[33mpdf    skipped — no headless Chromium found\x1b[0m\n");
    return;
  }

  const pdf = await htmlToPdf(html);
  writeFileSync(out, pdf);
  const fonts = fontsLanded(pdf);
  console.log(`  pdf    ${out}  ${(pdf.length / 1024).toFixed(0)}KB · ${pageCount(pdf)} pages`);
  console.log(`  fonts  ${fonts.ok ? "\x1b[32m✓ embedded\x1b[0m" : "\x1b[31m✗ FELL BACK\x1b[0m"}  ${fonts.fonts.join(", ")}`);
  if (!fonts.ok) {
    console.log("\n  \x1b[31mThe document rendered in fallback faces. Check that lib/reports/assets/fonts.css is WOFF v1.\x1b[0m");
    process.exitCode = 1;
  }
  console.log("");
}

main().catch((e) => {
  console.error(`\n\x1b[31m${e instanceof Error ? e.message : String(e)}\x1b[0m\n`);
  process.exit(1);
});
