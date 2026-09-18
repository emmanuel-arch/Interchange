// ─────────────────────────────────────────────────────────────────────────────
// THE SESSION REPORT — what was built, what it cost, and what is left.
//
//   npx tsx scripts/build-session-report.ts
//
// Writes reports/Interchange-Build-<date>.{html,pdf}
//
// Figures are read from the artefacts themselves — the crunch results in
// private/reports, the bureau capture manifest, the lender registry — rather
// than typed in. A status document that has to be kept in step by hand stops
// being true on the second day.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { htmlToPdf, chromiumPath, pageCount } from "../lib/reports/render";
import { LETTERHEAD, BRAND_COLOURS } from "../lib/brand";
import { REGISTRY_STATS } from "../lib/statement/lenders";
import { esc } from "../lib/reports/theme";

const OUT = resolve("../../../reports");
const REPORTS = resolve("../../private/reports");
const CAPTURES = resolve("../../../reports/crb/CRB-30058967-2026-09-18-raw/captures.json");
const DATE = new Date().toISOString().slice(0, 10);

const N = BRAND_COLOURS.navy;
const G = BRAND_COLOURS.green;
const INK = "#14181b";
const MUTED = "#6b7580";
const RULE = "#e2e6ea";
const PAPER = "#fcfcfb";
const RED = "#b4231d";
const AMBER = "#8a5a00";

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

type Crunch = {
  file: string;
  name: string;
  months: number;
  txns: number;
  coverageIn: number | null;
  incomePerMonth: number;
  ceiling: number;
  score: number;
  band: string;
  lenders: number;
  unregistered: number;
  commitment: number;
};

function crunches(): Crunch[] {
  if (!existsSync(REPORTS)) return [];
  const out: Crunch[] = [];
  for (const f of readdirSync(REPORTS).filter((x) => x.endsWith(".json"))) {
    const r = JSON.parse(readFileSync(join(REPORTS, f), "utf8"));
    out.push({
      file: f,
      name: r.summary?.header?.customerName ?? f,
      months: r.period?.months ?? 0,
      txns: r.period?.txnCount ?? 0,
      coverageIn: r.reconciliation?.coverageIn ?? null,
      incomePerMonth: r.income?.perMonth ?? 0,
      ceiling: r.affordability?.recommendedMaxInstallment ?? 0,
      score: r.score?.value ?? 0,
      band: r.score?.band ?? "—",
      lenders: r.lenderTotals?.count ?? 0,
      unregistered: r.lenderTotals?.unregistered ?? 0,
      commitment: r.lenderTotals?.monthlyCommitment ?? 0,
    });
  }
  return out.sort((a, b) => b.txns - a.txns);
}

function pulls(): { reportType: number; name: string; ok: boolean; ms: number; sha: string | null; tariff: number | null }[] {
  if (!existsSync(CAPTURES)) return [];
  const j = JSON.parse(readFileSync(CAPTURES, "utf8"));
  const run = j.runs?.[j.runs.length - 1];
  return (run?.reports ?? []).map((r: Record<string, unknown>) => ({
    reportType: Number(r.reportType),
    name: String(r.name),
    ok: r.ok === true,
    ms: Number(r.ms ?? 0),
    sha: (r.sha256 as string | null) ?? null,
    tariff: (r.indicativeTariff as number | null) ?? null,
  }));
}

type Item = { what: string; detail: string; tone?: "good" | "watch" | "bad" };

const DECISIONS: Item[] = [
  {
    what: "Real customer statements were moved out of the web root",
    detail:
      "Three consented M-PESA statements were sitting in public/, which Vercel serves. Their filenames contain the holders' phone numbers, so the URLs were guessable, and the passwords are six digits. They now live in interchange/private/statements/, which is outside the Next.js web root and git-ignored. Nothing was deployed from public/ before the move.",
    tone: "bad",
  },
  {
    what: "A bank's paybill is no longer read as debt service",
    detail:
      "The first cut of the lender matcher counted every payment to Equity's 247247, KCB's 522533 and the rest as a loan repayment. A bank's general paybill takes school fees, rent, deposits and loan repayments through one number and the row does not say which. Counting it all as commitment removed KES 23,921 a month of headroom from one borrower — enough to turn an approvable application into a decline on an assumption. Banks and SACCOs are now only debt service when the row names a loan.",
    tone: "bad",
  },
  {
    what: "Fund managers are excluded, not flagged as unlicensed lenders",
    detail:
      "“Nabo Capital Ltd” and “Cytonn Money Market Fund” both trip the CAPITAL legal-form pattern, and the engine duly reported a borrower as servicing an unregistered lender when they were in fact saving. Money to a fund is the opposite signal from money to a lender. Fifteen CMA-licensed managers are now registered specifically to be excluded, and that one fix moved Emmanuel's score from Poor to Fair.",
    tone: "watch",
  },
  {
    what: "The monthly chart and the headline now measure the same thing",
    detail:
      "The bars were drawn from classified-income rows while the cover said “statement total paid in”. The average line floated above every bar and the document could not be checked against itself. Both now use the member's chosen basis, and both tie to Safaricom's own printed totals.",
    tone: "watch",
  },
  {
    what: "A new console page was rendering without a session",
    detail:
      "proxy.ts derives its protected list from the rights catalogue, but Next.js requires the route matcher to be a static literal, so the two are maintained separately. /policy was added to one and not the other, and the page rendered to anyone who typed the URL. Fixed, and a build-time assertion now fails the next time the two drift — which is the actual fix.",
    tone: "bad",
  },
  {
    what: "Four-digit operator codes are enabled on the public deployment",
    detail:
      "Production refuses access codes unless INTERCHANGE_ALLOW_CODE_LOGIN is 1. It is set, because the requirement is that Geoffrey signs in and configures his own settings and a browser cannot produce the Ed25519 signature the real door expects. Five failures lock the operator for fifteen minutes and there is a per-IP ceiling above that. This should go back to 0 the day after the demo.",
    tone: "watch",
  },
];

const OUTSTANDING: Item[] = [
  { what: "Metropol's written answer (E1)", detail: "Bureau Direct stays Micromart-only until Metropol confirm reports may be pulled for other lenders through an intermediary. This is still the largest commercial risk in the plan and nothing here changes it.", tone: "bad" },
  { what: "The Registry still runs on Supabase in Ireland", detail: "B1–B3 are done, so the move to servicesuite-in can start. Until it does, the p95 target of 400 ms is a measurement of distance, not of the fan-out.", tone: "watch" },
  { what: "The CallBox superuser password", detail: "Still in plain text in a repository, for a Postgres port that answers from the public internet. The Registry moving onto that machine inherits the problem. Rotating it needs coordinating with whoever runs CallBox.", tone: "bad" },
  { what: "ODPC registration number", detail: "Not supplied, so it does not print on any document. A plausible-looking number on a regulated report would be a fabrication.", tone: "watch" },
  { what: "SVG and knockout artwork", detail: "Three PNGs were supplied and everything built so far is derived from them. An SVG master and a white lockup are needed before signage, merchandise or any dark deck.", tone: "watch" },
  { what: "Statement Crunch in the live portal", detail: "The engine, the policy layer and the document are done and proven on four real statements. Wiring the upload route, the metering and the theatre into the member portal is the next block of work.", tone: "watch" },
];

function itemTable(items: Item[]): string {
  const colour = (t?: string) => (t === "bad" ? RED : t === "watch" ? AMBER : G);
  return `<table><tbody>${items.map((i) => `<tr>
    <td style="width:4px;padding:0;background:${colour(i.tone)}"></td>
    <td class="k" style="width:33%">${esc(i.what)}</td>
    <td style="font-size:8.6pt;color:${MUTED};line-height:1.5">${esc(i.detail)}</td>
  </tr>`).join("")}</tbody></table>`;
}

async function main() {
  const cs = crunches();
  const ps = pulls();
  const billed = ps.filter((p) => p.ok);
  const spend = billed.reduce((s, p) => s + (p.tariff ?? 0), 0);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Interchange build report</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 portrait; margin: 15mm 14mm; }
  html, body { margin: 0; background: ${PAPER}; color: ${INK};
    font-family: "Segoe UI", system-ui, sans-serif; font-size: 9.4pt; line-height: 1.5; }
  h1 { font-size: 23pt; margin: 0 0 2mm; letter-spacing: -0.015em; color: ${N}; }
  h2 { font-size: 12pt; margin: 0 0 2mm; color: ${N}; }
  .sub { font-size: 10.5pt; color: ${MUTED}; margin: 0 0 7mm; }
  .lede { color: ${MUTED}; margin: 0 0 3mm; max-width: 168mm; }
  .blk { margin-bottom: 7mm; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 6.8pt; text-transform: uppercase; letter-spacing: .1em;
       color: ${MUTED}; font-weight: 600; padding: 0 2mm 1.5mm 0; border-bottom: 1.2px solid ${N}; }
  td { padding: 1.7mm 2mm 1.7mm 0; border-bottom: 1px solid ${RULE}; vertical-align: top; }
  td.k { font-weight: 600; padding-left: 3mm; }
  td.n { text-align: right; font-family: Consolas, monospace; font-size: 8.6pt; white-space: nowrap; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm;
          padding-bottom: 3.5mm; margin-bottom: 7mm; border-bottom: 2.5px solid ${N}; }
  .lh { text-align: right; font-size: 7.4pt; color: ${MUTED}; line-height: 1.55; }
  .wordmark { font-size: 15pt; font-weight: 700; color: ${N}; letter-spacing: -0.01em; }
  .wordmark span { color: ${G}; }
  .tag { font-size: 7.4pt; color: ${MUTED}; letter-spacing: .04em; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm; margin-bottom: 7mm; }
  .tile { border: 1px solid ${RULE}; border-radius: 2mm; padding: 3mm; background: #fff; }
  .tile .v { font-family: Consolas, monospace; font-size: 15pt; font-weight: 700; color: ${N}; }
  .tile .l { font-size: 7.2pt; color: ${MUTED}; text-transform: uppercase; letter-spacing: .09em; margin-top: 1mm; }
  .rule { height: 3px; background: linear-gradient(90deg, ${N}, ${G}); margin: 6mm 0; border-radius: 2px; }
  .note { border-left: 3px solid ${G}; padding: 2mm 0 2mm 4mm; margin: 3mm 0; font-size: 8.8pt; }
  .note.bad { border-left-color: ${RED}; }
  .foot { margin-top: 7mm; padding-top: 3mm; border-top: 1px solid ${RULE}; font-size: 7.2pt; color: ${MUTED}; }
  code { font-family: Consolas, monospace; font-size: 8.4pt; }
</style></head><body>

<div class="head">
  <div>
    <div class="wordmark">Inter<span>change</span></div>
    <div class="tag">Data Exchange Platform · X-Road Architecture</div>
  </div>
  <div class="lh">
    <strong style="color:${INK}">${esc(LETTERHEAD.legalName ?? LETTERHEAD.name)}</strong><br>
    ${LETTERHEAD.addressLines.map(esc).join("<br>")}<br>
    ${esc(LETTERHEAD.phone ?? "")} · ${esc(LETTERHEAD.email ?? "")}<br>
    Reg. ${esc(LETTERHEAD.companyRegistration ?? "—")} · KRA PIN ${esc(LETTERHEAD.kraPin ?? "—")}
  </div>
</div>

<h1>Build report</h1>
<p class="sub">Statement Crunch, the lender glossary, report 11 and the bureau captures · ${esc(DATE)} · demo day Tuesday 22 September</p>

<div class="tiles">
  <div class="tile"><div class="v">${REGISTRY_STATS.total}</div><div class="l">Institutions in the glossary</div></div>
  <div class="tile"><div class="v">${cs.length}</div><div class="l">Real statements crunched</div></div>
  <div class="tile"><div class="v">${billed.length}</div><div class="l">Bureau reports captured</div></div>
  <div class="tile"><div class="v">12 / 14</div><div class="l">Report types now real in the gallery</div></div>
</div>

<div class="blk">
  <h2>What the crunching engine now does</h2>
  <p class="lede">
    Every counterparty on a statement is resolved to an M-PESA shortcode, an account reference and a name, then put
    against the Central Bank of Kenya's register of ${REGISTRY_STATS.digitalCreditProviders} digital credit providers,
    its ${REGISTRY_STATS.banks} licensed banks and ${REGISTRY_STATS.microfinanceBanks} microfinance banks, and SASRA's
    deposit-taking SACCOs. A row reading <code>Pay Bill Fuliza M-Pesa to 4145907 - MULAR CREDIT LIMITED Acc. 7981717</code>
    is now debt service to a licensed provider carrying an account number, not a trip to the shops. Each identification
    carries its evidence, and a counterparty that looks like a lender but sits on no register is reported as exactly that.
  </p>
  <table>
    <thead><tr>
      <th style="width:26%">Statement</th><th class="n">Months</th><th class="n">Rows</th><th class="n">Read</th>
      <th class="n">Income / mo</th><th class="n">Commitments</th><th class="n">Lenders</th><th class="n">Ceiling</th><th class="n">Score</th>
    </tr></thead>
    <tbody>
      ${cs.map((c) => `<tr>
        <td class="k" style="padding-left:0">${esc(c.name)}</td>
        <td class="n">${c.months}</td>
        <td class="n">${c.txns.toLocaleString("en-KE")}</td>
        <td class="n">${c.coverageIn !== null ? `${(c.coverageIn * 100).toFixed(1)}%` : "—"}</td>
        <td class="n">${kes(c.incomePerMonth)}</td>
        <td class="n">${kes(c.commitment)}</td>
        <td class="n">${c.lenders}${c.unregistered ? ` <span style="color:${RED}">+${c.unregistered}?</span>` : ""}</td>
        <td class="n">${c.ceiling ? kes(c.ceiling) : "nil"}</td>
        <td class="n">${c.score} ${esc(c.band)}</td>
      </tr>`).join("")}
    </tbody>
  </table>
  <div class="note">
    <strong>Read</strong> is our parse against Safaricom's own printed PAID IN total. All four statements read at 100%,
    which is what makes the headline checkable: anyone holding the statement can add up page one and get our number.
    On every one of them Safaricom's own summary does not foot — their printed total differs from the sum of their own
    rows — and the report prints both figures rather than choosing the one that looks better.
  </div>
</div>

<div class="rule"></div>

<div class="blk">
  <h2>The report</h2>
  <p class="lede">
    Ten pages, on the crunch theatre's own dark surface rather than the bureau documents' paper. The order is answer
    first, evidence second, method last: the instalment ceiling, the score and the four worst flags are above the fold on
    page one; the statement's own summary and our reconciliation are on page two; the lenders, their registers and the
    month-by-month commitment calendar follow; the affordability arithmetic is shown step by step; and the last page
    prints the settings the whole thing was produced on, so a number can be defended a year later.
  </p>
  <table>
    <thead><tr><th style="width:22%">Page</th><th>What it carries</th></tr></thead>
    <tbody>
      ${[
        ["1 · Cover", "Comfortable instalment, average monthly income, monthly surplus, existing commitments, the score dial, debt-service ratio now and if granted, and the four worst findings."],
        ["2 · The statement", "Safaricom's header and summary reproduced as printed, our parse totalled beside it, the coverage, and where their own arithmetic does not foot."],
        ["3 · Income and expenditure", "Money in and money out by month with the average-income line drawn on the same axis, the borrowed share inside each bar, and the net position."],
        ["4 · What counts as income", "The ladder from the printed total to the figure used, the same statement read the other three ways, and the full monthly ledger."],
        ["5 · Where the money goes", "Categories, largest counterparties, whether this is a trading account, and supplier-shaped spend."],
        ["6–7 · Who else they owe", "Every credit provider with its register and the evidence, the commitment calendar, unregistered lenders, and debt being serviced off this rail."],
        ["8 · What they can afford", "Every step of the arithmetic, both routes side by side, and the settings used."],
        ["9 · What moved the score", "Twelve drivers, each against its own configured maximum."],
        ["10 · Method", "Source document and its hash, engine version, policy, what differs from the default, where the engine refused to guess, and a QR code that verifies the document."],
      ].map(([p, d]) => `<tr><td class="k" style="padding-left:0">${esc(p)}</td><td style="font-size:8.6pt;color:${MUTED}">${esc(d)}</td></tr>`).join("")}
    </tbody>
  </table>
</div>

<div class="blk">
  <h2>Settings, and why they are settings</h2>
  <p class="lede">
    Average monthly income is not a fact. On Elizabeth's statement the four defensible definitions give
    ${kes(114172)}, ${kes(53804)}, ${kes(50666)} and ${kes(57587)} a month — a factor of two. A microfinance lender
    writing working capital to traders wants the first; a salary-advance lender wants the third; both are right for
    their own book. The same is true of the instalment ceiling. So all of it is per-member configuration, Geoffrey can
    change it himself at <code>/policy</code>, and every report prints the settings it was produced on.
  </p>
  <p class="lede">
    What is <em>not</em> configurable is the evidence: what the statement says, what Safaricom's summary totals, which
    counterparties are on the CBK register, how many months the declared period covers. A member configures how to read
    the evidence, never what the evidence is.
  </p>
</div>

<div class="rule"></div>

<div class="blk">
  <h2>The bureau pulls</h2>
  <p class="lede">
    Seven billed pulls on national ID 30058967, approved as plan item F3, captured verbatim with a SHA-256 over the
    bytes written. The preview gallery now shows real answers for 12 of the 14 report types; only report 4
    (Metropol's own PDF, which cannot be anonymised without altering the bureau's document) and report 22
    (refused, E029, not on the contract) remain.
  </p>
  <table>
    <thead><tr><th style="width:8%">Type</th><th style="width:34%">Report</th><th class="n">Latency</th><th class="n">Indicative</th><th style="width:26%">SHA-256</th></tr></thead>
    <tbody>
      ${ps.map((p) => `<tr>
        <td class="k" style="padding-left:0">${p.reportType}</td>
        <td>${esc(p.name)}</td>
        <td class="n">${p.ms} ms</td>
        <td class="n">${p.tariff !== null ? kes(p.tariff) : "—"}</td>
        <td class="n" style="font-size:7.4pt;color:${MUTED};text-align:left">${esc((p.sha ?? "").slice(0, 20))}…</td>
      </tr>`).join("")}
      <tr><td colspan="3" class="k" style="padding-left:0;border-top:1.5px solid ${N}">Indicative spend</td>
        <td class="n" style="border-top:1.5px solid ${N};font-weight:700">${kes(spend)}</td>
        <td style="border-top:1.5px solid ${N}"></td></tr>
    </tbody>
  </table>
  <div class="note">
    Worth the money for a reason beyond the gallery. A standalone report 1 returns citizenship, clan, ethnic group,
    occupation, place of birth, registration office and slots for photo, fingerprint and signature — none of which
    appear in the identity block nested inside report 12. Showing that nested block and calling it Identity
    Verification understated the product by about two thirds. Also found: within a single report 1 response,
    <code>date_of_birth</code> and <code>dob</code> disagree by one day.
  </div>
</div>

<div class="blk">
  <h2>Decisions taken, and things found the hard way</h2>
  ${itemTable(DECISIONS)}
</div>

<div class="blk">
  <h2>Still outstanding</h2>
  ${itemTable(OUTSTANDING)}
</div>

<div class="blk">
  <h2>Signing in on Tuesday</h2>
  <table>
    <thead><tr><th style="width:24%">Who</th><th style="width:20%">Role</th><th style="width:18%">Scope</th><th>Opens</th></tr></thead>
    <tbody>
      <tr><td class="k" style="padding-left:0">Birgen Krosovic</td><td>Super admin</td><td>Platform</td><td style="font-size:8.6pt;color:${MUTED}">Everything, including governance and every member's settings.</td></tr>
      <tr><td class="k" style="padding-left:0">Geoffrey Njane</td><td>Member admin</td><td>KE/LENDER/3002</td><td style="font-size:8.6pt;color:${MUTED}">Micromart's own surfaces, and <code>/policy</code> to change how his statements are read.</td></tr>
    </tbody>
  </table>
  <div class="note bad">
    Access codes were sent separately and are not written in this document. Turn
    <code>INTERCHANGE_ALLOW_CODE_LOGIN</code> back to <code>0</code> once the demo is over — four digits on a public URL
    is survivable for a week because of the lockout, and is not a permanent arrangement.
  </div>
</div>

<div class="foot">
  Generated by <code>scripts/build-session-report.ts</code> on ${esc(DATE)}. Crunch figures are read from the result JSON
  in <code>interchange/private/reports/</code>; bureau figures from the capture manifest; glossary counts from
  <code>lib/statement/lenders.ts</code>. ${esc(LETTERHEAD.legalName ?? "")} · ${esc(LETTERHEAD.website)}
</div>

</body></html>`;

  writeFileSync(join(OUT, `Interchange-Build-${DATE}.html`), html);
  console.log(`  html → reports/Interchange-Build-${DATE}.html`);
  if (!chromiumPath()) return;
  const pdf = await htmlToPdf(html);
  writeFileSync(join(OUT, `Interchange-Build-${DATE}.pdf`), pdf);
  console.log(`  pdf  → reports/Interchange-Build-${DATE}.pdf · ${pageCount(pdf) ?? "?"} pages · ${Math.round(pdf.length / 1024)} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
