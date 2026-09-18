// ─────────────────────────────────────────────────────────────────────────────
// Render report 11 — Cashflow & Affordability — for the consented demo
// statements, as HTML and PDF.
//
//   npx tsx scripts/build-cashflow-reports.ts              # all four
//   npx tsx scripts/build-cashflow-reports.ts elizabeth    # one
//   npx tsx scripts/build-cashflow-reports.ts --html       # skip the PDF pass
//
// Output goes to ../../private/reports/, which is outside the web root and
// outside git. These documents describe real, named people who consented to
// their statements being used to build the product — that consent does not
// extend to the documents being served from a public URL.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { extractPdfText } from "../lib/statement/extract-pdf";
import { parseMpesaStatement } from "../lib/statement/mpesa-parser";
import { analyseCashflow } from "../lib/statement/cashflow";
import { DEFAULT_POLICY, normalisePolicy, type CrunchPolicy } from "../lib/statement/policy";
import { cashflowDocument } from "../lib/reports/cashflow-doc";
import { renderTheatreDoc } from "../lib/reports/theatre";
import { htmlToPdf, chromiumPath, fontsLanded, pageCount } from "../lib/reports/render";
import { documentReference, eatTimestamp, sha256 } from "../lib/reports/reference";

const STATEMENTS = resolve("../../private/statements");
const OUT = resolve("../../private/reports");

type Candidate = { id: string; file: string; password: string; name: string; phone: string; email?: string };

const args = process.argv.slice(2);
const htmlOnly = args.includes("--html");
const only = args.find((a) => !a.startsWith("--"));

function candidates(): Candidate[] {
  const manifest = join(STATEMENTS, "manifest.json");
  if (!existsSync(manifest)) throw new Error(`No manifest at ${manifest}.`);
  return JSON.parse(readFileSync(manifest, "utf8")).candidates as Candidate[];
}

/**
 * Geoffrey's settings, as a member would have configured them.
 *
 * Deliberately NOT the Interchange default, for two reasons. It proves the
 * policy layer actually reaches every figure rather than being a form that
 * writes to nothing; and it makes the "settings that differ from the default"
 * table on page 8 show something, which is the page that sells the feature.
 */
const MICROMART_POLICY: CrunchPolicy = normalisePolicy(
  {
    label: "Micromart Africa — working capital",
    updatedBy: "Geoffrey Njane",
    income: {
      // A microfinance book lending to traders reads turnover, not payslips.
      basis: "statement_total_in",
      monthsBasis: "declared_period",
      excludeSelfTransfers: true,
      excludeReversals: true,
      countBankBulkAsIncome: false,
    },
    affordability: {
      method: "lower_of_both",
      dsrCap: 0.4,
      surplusShare: 0.35,
      deductExistingCommitments: true,
      floorKes: 1000,
      ceilingKes: 0,
      roundToKes: 500,
      countBankTransfersAsSpend: false,
    },
    score: {
      drivers: {
        // This book has been hurt by stacking more than by anything else.
        loanDependency: { enabled: true, weight: 95 },
        lenderCount: { enabled: true, weight: 45 },
        unregisteredLenders: { enabled: true, weight: 35 },
        gambling: { enabled: true, weight: 90 },
      },
    },
    thresholds: { lenderCountWatch: 2 },
  },
  "KE/LENDER/3002",
).policy;

async function build(c: Candidate, policy: CrunchPolicy) {
  const path = join(STATEMENTS, c.file);
  const bytes = readFileSync(path);
  const text = await extractPdfText(bytes, c.password);
  const txns = parseMpesaStatement(text);
  const report = analyseCashflow(txns, text, policy);

  const fileSha = sha256(bytes);
  const at = new Date();
  const reference = documentReference([policy.memberCode, fileSha, "report-11"].join("|"), at);

  const doc = cashflowDocument(report, {
    reference,
    reportDate: eatTimestamp(at),
    requestedBy: {
      person: "Geoffrey Njane",
      organisation: "Micromart Africa Limited",
      memberCode: policy.memberCode,
    },
    consentRef: `CN-DEMO-${c.id.toUpperCase()}`,
    subject: { name: c.name, msisdn: c.phone, email: c.email ?? null },
    fileSha256: fileSha,
  });

  mkdirSync(OUT, { recursive: true });
  const html = renderTheatreDoc(doc);
  const base = `IX-Cashflow-${c.id}-${reference}`;
  writeFileSync(join(OUT, `${base}.html`), html);
  writeFileSync(join(OUT, `${base}.json`), JSON.stringify(report, null, 2) + "\n");

  const csv = ["date,time,receipt,details,counterparty,shortcode,account_ref,role,lender,category,direction,amount,balance"]
    .concat(
      // The transaction ledger, with the engine's reading beside every row, so
      // a disputed classification can be found rather than argued about.
      (await import("../lib/statement/cashflow")).enrich(txns, policy).map((t) =>
        [
          t.date, t.time ?? "", t.receipt,
          `"${t.details.replace(/"/g, '""').replace(/\s+/g, " ")}"`,
          `"${(t.counterparty.name ?? "").replace(/"/g, '""')}"`,
          t.counterparty.code ?? "",
          t.counterparty.accountRef ?? "",
          t.role,
          `"${(t.lender?.name ?? "").replace(/"/g, '""')}"`,
          t.lender?.category ?? "",
          t.direction, t.amount, t.balance,
        ].join(","),
      ),
    )
    .join("\r\n");
  writeFileSync(join(OUT, `${base}-transactions.csv`), csv + "\r\n");

  let pdfNote = "html only";
  if (!htmlOnly && chromiumPath()) {
    const pdf = await htmlToPdf(html, { timeoutMs: 120_000 });
    const fonts = fontsLanded(pdf);
    if (!fonts.ok) {
      throw new Error(
        `${c.name}: the PDF fell back to system faces (${fonts.fonts.join(", ")}). ` +
          `The document would look like a fax and nobody would notice from the HTML.`,
      );
    }
    writeFileSync(join(OUT, `${base}.pdf`), pdf);
    pdfNote = `${pageCount(pdf) ?? "?"} pages · ${(pdf.length / 1024).toFixed(0)} KB`;
  } else if (!htmlOnly) {
    pdfNote = "no headless Chromium on this host";
  }

  console.log(
    `  ${c.name.padEnd(26)} ${reference}  ${String(report.period.months).padStart(2)} mo · ` +
      `income ${report.income.perMonth.toLocaleString("en-KE").padStart(9)}/mo · ` +
      `ceiling ${report.affordability.recommendedMaxInstallment.toLocaleString("en-KE").padStart(7)}/mo · ` +
      `score ${report.score.value} ${report.score.band.padEnd(10)} · ${report.lenders.length} lenders · ${pdfNote}`,
  );
  return report;
}

(async () => {
  console.log(`\nRendering report 11 on ${MICROMART_POLICY.label} settings.\n`);
  for (const c of candidates()) {
    if (only && c.id !== only) continue;
    await build(c, MICROMART_POLICY);
  }
  console.log(`\n  → ${OUT}\n`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
