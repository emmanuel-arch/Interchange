// ─────────────────────────────────────────────────────────────────────────────
// Run the cashflow engine over the consented demo statements and print what it
// found. This is the check that the glossary, the summary reader and the policy
// agree with the documents — not a unit test with invented rows.
//
//   npx tsx scripts/crunch-candidates.ts            # all four, summary only
//   npx tsx scripts/crunch-candidates.ts elizabeth  # one, in detail
//
// The statements live outside the web root and outside git (see
// interchange/private/statements/). Passwords come from the environment or the
// manifest beside them, never from this file.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { extractPdfText } from "../lib/statement/extract-pdf";
import { parseMpesaStatement } from "../lib/statement/mpesa-parser";
import { analyseCashflow } from "../lib/statement/cashflow";
import { DEFAULT_POLICY, normalisePolicy } from "../lib/statement/policy";
import { REGISTRY_STATS } from "../lib/statement/lenders";

const DIR = resolve("../../private/statements");
const MANIFEST = resolve(DIR, "manifest.json");

type Candidate = { id: string; file: string; password: string; name: string; phone: string; email?: string };

function candidates(): Candidate[] {
  if (!existsSync(MANIFEST)) {
    throw new Error(`No manifest at ${MANIFEST}. It holds the demo statements' passwords and is git-ignored.`);
  }
  return JSON.parse(readFileSync(MANIFEST, "utf8")).candidates as Candidate[];
}

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function run(c: Candidate, detail: boolean) {
  const path = resolve(DIR, c.file);
  const text = await extractPdfText(readFileSync(path), c.password);
  const txns = parseMpesaStatement(text);
  const report = analyseCashflow(txns, text, DEFAULT_POLICY);
  const r = report;

  console.log(`\n${"═".repeat(78)}`);
  console.log(`  ${c.name}  ·  ${c.phone}`);
  console.log("═".repeat(78));
  console.log(`  Statement header  ${r.summary.header.customerName ?? "—"} · ${r.summary.header.mobileNumber ?? "—"}`);
  console.log(`  Period            ${r.period.label ?? "—"}  →  ${r.period.months} months (${r.period.monthsBasis}), ${r.period.observedMonths} with activity`);
  console.log(`  Transactions      ${r.period.txnCount.toLocaleString()}`);
  console.log(`  Printed total     in ${kes(r.reconciliation.printed?.paidIn ?? 0)} · out ${kes(r.reconciliation.printed?.paidOut ?? 0)}`);
  console.log(`  Our parse         in ${kes(r.reconciliation.parsed.paidIn)} · out ${kes(r.reconciliation.parsed.paidOut)}`);
  console.log(`  Coverage          in ${r.reconciliation.coverageIn !== null ? pct(r.reconciliation.coverageIn) : "—"} · out ${r.reconciliation.coverageOut !== null ? pct(r.reconciliation.coverageOut) : "—"} · summary foots: ${r.reconciliation.summaryFoots}`);
  console.log();
  console.log(`  INCOME  ${r.income.basisTitle}`);
  console.log(`    ${kes(r.income.perMonth)}/mo   (total ${kes(r.income.total)} ÷ ${r.income.months})`);
  for (const a of r.income.alternatives) console.log(`      alt · ${a.title.padEnd(30)} ${kes(a.perMonth).padStart(16)}/mo`);
  console.log();
  console.log(`  Spend ${kes(r.perMonth.spend)}/mo · surplus ${kes(r.perMonth.net)}/mo · debt service ${kes(r.perMonth.repaid)}/mo`);
  console.log(`  Score ${r.score.value}/${r.score.max} ${r.score.band} · PD ${pct(r.score.pd)}`);
  console.log(`  Instalment ceiling ${kes(r.affordability.recommendedMaxInstallment)}/mo  (DSR now ${pct(r.affordability.currentDsr)} → ${pct(r.affordability.projectedDsr)})`);
  console.log();
  console.log(`  LENDERS (${r.lenderTotals.count}: ${r.lenderTotals.registered} registered, ${r.lenderTotals.unregistered} not)`);
  for (const l of r.lenders.slice(0, detail ? 40 : 12)) {
    const tag = l.unregistered ? "UNREGISTERED" : `${l.regulator}/${l.category}`;
    console.log(
      `    ${l.name.slice(0, 32).padEnd(33)} ${tag.padEnd(14)} repaid ${kes(l.repaid).padStart(14)}  borrowed ${kes(l.borrowed).padStart(13)}  ${String(l.events).padStart(4)} ev  ${l.monthsActive}mo  ${l.codes.join(",")}`,
    );
  }
  console.log();
  console.log("  WHERE THE MONEY GOES");
  for (const c2 of r.spendByCategory.slice(0, detail ? 20 : 8)) {
    console.log(`    ${c2.category.padEnd(24)} ${kes(c2.amount).padStart(14)}  ${pct(c2.share).padStart(7)}  ${String(c2.count).padStart(5)} rows   ${c2.topCounterparties.slice(0, 2).map((p) => p.name.slice(0, 22)).join(" · ")}`);
  }
  console.log();
  console.log(`  BUSINESS READ  trader=${r.business.isTrader} (${r.business.confidence})`);
  for (const s of r.business.signals) console.log(`    · ${s}`);
  console.log();
  console.log("  FLAGS");
  for (const f of r.flags) console.log(`    [${f.tone.toUpperCase().padEnd(5)}] ${f.label} — ${f.detail.slice(0, 110)}`);

  if (detail) {
    console.log("\n  SCORE DRIVERS");
    for (const d of r.score.drivers) {
      console.log(`    ${(d.points >= 0 ? "+" : "") + String(d.points).padStart(4)}  /${String(d.weight).padEnd(4)} ${d.title.padEnd(22)} ${d.detail.slice(0, 90)}`);
    }
    console.log("\n  AFFORDABILITY WORKINGS");
    for (const w of r.affordability.workings) {
      console.log(`    ${w.step.padEnd(34)} ${w.value === null ? "" : kes(w.value).padStart(14)}   ${w.detail.slice(0, 80)}`);
    }
    console.log("\n  UNCLASSIFIED CREDITS");
    console.log(`    ${kes(r.totals.unclassifiedCredits)} · self-transfers ${kes(r.totals.selfTransfers)} · reversals ${kes(r.totals.reversals)}`);
    console.log("\n  NARRATIVE");
    for (const n of r.narrative) console.log(`    ${n}\n`);
  }
  return report;
}

(async () => {
  const only = process.argv[2];
  console.log(`\nLender glossary: ${REGISTRY_STATS.total} institutions · ${REGISTRY_STATS.digitalCreditProviders} CBK digital credit providers · ${REGISTRY_STATS.banks} banks · ${REGISTRY_STATS.microfinanceBanks} microfinance banks · ${REGISTRY_STATS.saccos} SACCOs`);
  const { adjusted } = normalisePolicy(DEFAULT_POLICY);
  if (adjusted.length) console.log("Policy adjustments:", adjusted);
  for (const c of candidates()) {
    if (only && c.id !== only) continue;
    await run(c, Boolean(only));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
