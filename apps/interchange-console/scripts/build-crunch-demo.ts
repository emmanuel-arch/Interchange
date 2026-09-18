// ─────────────────────────────────────────────────────────────────────────────
// Build the crunch theatre's demo: the production statement engine, run over a
// synthetic statement. Writes public/preview/crunch/*.
//
//   npx tsx scripts/build-crunch-demo.ts
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { syntheticStatement } from "../lib/statement/synthetic";
import { parseMpesaStatement, extractStatementName, namesMatch } from "../lib/statement/mpesa-parser";
import { assembleCrunch } from "../lib/statement/assemble";
import { statementDocument } from "../lib/reports/documents";
import { renderReportHtml } from "../lib/reports/shell";
import { htmlToPdf, fontsLanded, chromiumPath } from "../lib/reports/render";
import { documentReference, eatTimestamp, sha256 } from "../lib/reports/reference";

const OUT = resolve("public/preview/crunch");

const { text, holder } = syntheticStatement();
const txns = parseMpesaStatement(text);
if (txns.length < 100) throw new Error(`The parser read only ${txns.length} rows from the synthetic statement.`);

const statementName = extractStatementName(text);
const nameCheck = statementName
  ? { statementName, expectedName: holder, matched: namesMatch(holder, statementName).match, overridden: false }
  : null;

const data = assembleCrunch(txns, nameCheck);
mkdirSync(OUT, { recursive: true });

const provenance = {
  statement: "synthetic",
  engine: "production statement engine (parser, classifier, features, audit, scorecard)",
  note: "The transactions are invented for this demo. Everything computed from them is the engine's real output.",
  builtAt: new Date().toISOString(),
};

writeFileSync(join(OUT, "crunch-result.json"), JSON.stringify({ provenance, ...data }, null, 2) + "\n");
const csv = ["receipt,date,time,details,direction,amount,balance,category,is_gambling,is_loan_app"]
  .concat(txns.map((t) => [t.receipt, t.date, t.time ?? "", `"${t.details.replace(/"/g, '""')}"`, t.direction, t.amount, t.balance, t.category, t.isGambling, t.isLoanApp].join(",")))
  .join("\r\n");
writeFileSync(join(OUT, "transactions.csv"), csv + "\r\n");

// The letterhead document, as a member downloads it after a live crunch.
async function renderDocument() {
  const reference = documentReference("interchange-sample|crunch|synthetic", new Date("2026-09-17T06:00:00Z"));
  const doc = statementDocument(
    data,
    {
      member: { code: "KE/LENDER/SAMPLE", name: "Sample Lender Limited" },
      subjectToken: sha256("sample|880000088"),
      consentRef: "CN-SAMPLE",
      generatedAt: eatTimestamp(),
      requestedBy: { person: "Sample Analyst", organisation: "Sample Lender Limited", memberCode: "KE/LENDER/SAMPLE" },
      reference,
      reportDate: eatTimestamp(new Date("2026-09-17T06:00:00Z")),
      contentDigest: sha256(JSON.stringify(data.features)),
      sample: true,
      subjectIdentity: { name: holder, idTypeLabel: "National ID", idNumber: "880000088", verified: null },
    },
    { fileSha256: sha256(text), synthetic: true },
  );
  const html = renderReportHtml(doc);
  writeFileSync(join(OUT, "crunch-report.html"), html);
  writeFileSync(
    join(OUT, "meta.json"),
    JSON.stringify({ reference, reportDate: doc.meta.reportDate, contentDigest: doc.meta.contentDigest, synthetic: true }, null, 2) + String.fromCharCode(10),
  );
  if (!chromiumPath()) return;
  const pdf = await htmlToPdf(html);
  const fonts = fontsLanded(pdf);
  if (!fonts.ok) throw new Error(`crunch report fell back to system faces: ${fonts.fonts.join(", ")}`);
  writeFileSync(join(OUT, "crunch-report.pdf"), pdf);
  console.log(`  crunch-report.pdf ${Math.round(pdf.length / 1024)} KB · ${reference}`);
}

const f = data.features;
console.log(
  `\n  ${txns.length} transactions · ${f.monthsCovered} months · income KES ${f.avgMonthlyIncome}/mo · net KES ${f.avgMonthlyNet}/mo\n` +
    `  score ${data.creditScore.score} ${data.creditScore.band} (${data.creditScore.decision}) · instalment ceiling KES ${data.affordability.recommendedMaxInstallment}/mo\n` +
    `  name check: ${nameCheck ? `${nameCheck.statementName} → ${nameCheck.matched ? "matched" : "MISMATCH"}` : "unreadable"}\n` +
    `  lenders seen: ${data.report.loanBehaviour.lenders.map((l) => l.name).join(", ") || "none"} · betting ${Math.round(f.gamblingRatio * 1000) / 10}%\n`,
);

renderDocument().catch((e) => {
  console.error(e);
  process.exit(1);
});
