// ─────────────────────────────────────────────────────────────────────────────
// REPORT 11 · CASHFLOW & AFFORDABILITY — the document.
//
// ── WHAT THIS DOCUMENT HAS TO SURVIVE ────────────────────────────────────────
// It is read three times by three different people, and it fails if it serves
// only one of them:
//
//   · A LOAN OFFICER, in two minutes, deciding. They need the ceiling, the
//     score and the flags, and they need them before the fold on page one.
//   · A CREDIT MANAGER, later, arguing. They need the arithmetic shown step by
//     step, the lenders named with their registers, and the settings that
//     produced the number — because "the system said so" loses that argument.
//   · A REGULATOR OR AUDITOR, much later. They need every figure traceable to
//     the statement it was read from, and they need to see where the engine
//     refused to guess.
//
// So the order is: answer first, evidence second, method last. Nothing on page
// one is unsupported by something later, and nothing later contradicts page
// one.
//
// ── THE ONE RULE THAT SHAPED EVERY PAGE ──────────────────────────────────────
// A figure that cannot be checked is decoration. The statement's own summary is
// reproduced as Safaricom printed it, our parse is totalled beside it, the
// coverage is stated, and where Safaricom's own arithmetic does not foot, the
// document says so rather than quietly picking the number that looks better.
// ─────────────────────────────────────────────────────────────────────────────
import type { CashflowReport } from "../statement/cashflow";
import {
  DRIVER_LABEL, INCOME_BASIS_LABEL, METHOD_LABEL, MONTHS_BASIS_LABEL, policyDiff,
} from "../statement/policy";
import { REGISTRY_STATS } from "../statement/lenders";
import { letterheadFor, SERVICE_HOST } from "../brand";
import { esc } from "./theme";
import { qrSvg, verifyUrl } from "./reference";
import { INTERCHANGE_STATEMENT_NOTICE } from "./notices";
import {
  T, SERIES, kes, kesCompact, pct, scoreDial, incomeExpenditureChart, netCashflowChart,
  rankedBars, driverBars, compositionBar, commitmentGrid, assetDataUri,
  type TheatreDoc, type TheatrePage,
} from "./theatre";

export type CashflowDocMeta = {
  reference: string;
  reportDate: string;
  /** The person who asked, and the organisation they asked for. */
  requestedBy: { person: string; organisation: string; memberCode: string };
  consentRef: string | null;
  subject: { name: string | null; msisdn: string | null; email: string | null };
  /** SHA-256 of the statement file. The link between document and source. */
  fileSha256: string;
  /** Set when the document is built from a demonstration statement. */
  sample?: boolean;
  watermark?: string;
};

const mono = (s: string) => `<span style="font-family:'JetBrains Mono',monospace">${esc(s)}</span>`;
const K = (n: number) => `KES&nbsp;${kes(n)}`;

function toneChip(tone: "good" | "watch" | "bad" | "info" | "mute", label: string): string {
  return `<span class="chip ${tone}">${esc(label)}</span>`;
}

/** Worst first. An officer reading four lines should meet the risk in line one. */
const rank = (tone: "good" | "watch" | "bad") => (tone === "bad" ? 2 : tone === "watch" ? 1 : 0);

/** The same three cuts the dial uses, so the arc and the word agree. */
function bandColour(r: CashflowReport): string {
  const { value, min, max } = r.score;
  if (value >= min + (max - min) * 0.72) return T.green;
  if (value >= min + (max - min) * 0.5) return T.amber;
  return T.red;
}

function categoryChip(category: string, unregistered: boolean): string {
  if (unregistered) return toneChip("bad", "unregistered");
  const map: Record<string, [string, string]> = {
    bank: ["info", "CBK bank"],
    mfb: ["info", "CBK microfinance bank"],
    dcp: ["good", "CBK digital credit"],
    sacco: ["info", "SASRA sacco"],
    mfi: ["info", "microfinance"],
    asset: ["good", "asset finance"],
    mno: ["info", "mobile money credit"],
    fund: ["mute", "fund"],
    aggregator: ["mute", "aggregator"],
  };
  const [tone, label] = map[category] ?? ["mute", category];
  return toneChip(tone as "good" | "watch" | "bad" | "info" | "mute", label);
}

// ─────────────────────────────────────────────────────────────────────────────

export function cashflowDocument(r: CashflowReport, meta: CashflowDocMeta): TheatreDoc {
  // The lender section grows with the borrower. Eight rows of evidence fill the
  // page under the tiles; beyond that it continues onto a second page with the
  // commitment calendar, rather than running off the bottom — which is what the
  // first cut of this did on a statement carrying twelve lenders.
  const LENDERS_ON_FIRST = 8;
  const pages: TheatrePage[] = [
    coverPage(r, meta),
    statementPage(r, meta),
    incomePage(r),
    incomeBasisPage(r),
    spendingPage(r),
    lenderPage(r, 0, LENDERS_ON_FIRST),
    ...(r.lenders.length > LENDERS_ON_FIRST || r.lenders.length >= 2 ? [lenderContinuationPage(r, LENDERS_ON_FIRST)] : []),
    affordabilityPage(r),
    scorePage(r),
    methodPage(r, meta),
  ];

  return {
    title: "Cashflow & Affordability",
    subtitle: r.summary.header.customerName ?? "M-PESA statement analysis",
    reference: meta.reference,
    reportDate: meta.reportDate,
    footerLeft: `${meta.reference} · Confidential to ${meta.requestedBy.organisation}`,
    watermark: meta.watermark,
    pages,
  };
}

// ── Page 1 · the answer ──────────────────────────────────────────────────────

function coverPage(r: CashflowReport, meta: CashflowDocMeta): TheatrePage {
  // The MARK plus live text, not the full lockup.
  //
  // The supplied lockup sets "Inter" and the strapline in navy #003868. On this
  // cover that measures 1.6:1 and the first half of the company's own name
  // disappears. The mark is fully saturated in both hues and reads at any size,
  // so it carries the identity and the name is set in type that can be read.
  const markUri = assetDataUri("brand/mark-192.png");
  const a = r.affordability;
  const worstFlag = r.flags.find((f) => f.tone === "bad") ?? r.flags.find((f) => f.tone === "watch");

  // The cover carries FOUR numbers and no more. Every one of them is the answer
  // to a question an officer actually asks, in the order they ask it.
  const tiles = [
    { cls: "hero", k: "Comfortable instalment", v: a.recommendedMaxInstallment > 0 ? `${K(a.recommendedMaxInstallment)}/mo` : "Nothing", s: a.recommendedMaxInstallment > 0 ? `${METHOD_LABEL[a.method].title}, ${pct(r.policy.affordability.dsrCap)} cap` : "Existing commitments already absorb the headroom." },
    { cls: "", k: "Average monthly income", v: `${K(r.income.perMonth)}`, s: `${r.income.basisTitle} ÷ ${r.income.months} months` },
    { cls: r.perMonth.net >= 0 ? "" : "bad", k: "Monthly surplus", v: `${K(r.perMonth.net)}`, s: "After spending, cash out, charges and existing debt service" },
    { cls: r.lenderTotals.count > r.policy.thresholds.lenderCountWatch ? "bad" : "warn", k: "Existing commitments", v: `${K(r.lenderTotals.monthlyCommitment)}/mo`, s: `${r.lenderTotals.count} credit provider${r.lenderTotals.count === 1 ? "" : "s"} on this statement` },
  ];

  return {
    cover: true,
    body: `
<div style="padding-top:13mm">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8mm;margin-bottom:9mm">
    <div style="display:flex;align-items:center;gap:3.5mm">
      ${markUri ? `<img src="${markUri}" alt="" style="height:10mm;width:10mm;object-fit:contain">` : ""}
      <span style="font-family:'JetBrains Mono',monospace;font-size:11pt;font-weight:700;letter-spacing:.3em;color:#fff">INTERCHANGE</span>
    </div>
    <div style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:7pt;color:${T.inkMuted};line-height:1.7">
      ${esc(meta.reference)}<br>${esc(meta.reportDate)}
      ${meta.sample ? `<br><span style="color:${T.amber}">DEMONSTRATION</span>` : ""}
    </div>
  </div>

  <div class="eyebrow">Report 11 · Cashflow &amp; Affordability</div>
  <h1 style="font-size:26pt">${esc(r.summary.header.customerName ?? "M-PESA statement")}</h1>
  <p style="margin-top:2.5mm;font-size:10pt;color:${T.inkSecondary}">
    ${esc(r.summary.header.mobileNumber ?? "—")}
    &nbsp;·&nbsp; ${esc(r.period.label ?? "period not declared")}
    &nbsp;·&nbsp; ${r.period.txnCount.toLocaleString("en-KE")} transactions
  </p>

  <div class="split" style="margin-top:6mm">
    <div>
      <div class="grid g2">
        ${tiles.map((t) => `<div class="tile ${t.cls}"><div class="k">${esc(t.k)}</div><div class="v">${t.v}</div><div class="s">${esc(t.s)}</div></div>`).join("")}
      </div>

      <div class="panel" style="margin-top:4mm">
        <div class="eyebrow muted" style="margin-bottom:1.5mm">What the officer needs to know</div>
        ${/* Four, ordered worst first. A cover that lists everything lists
              nothing: the fifth flag pushes the narrative off the page and the
              first one stops being read as the most important. The rest are on
              the pages that follow. */ ""}
        ${[...r.flags].sort((x, y) => rank(y.tone) - rank(x.tone)).slice(0, 4).map((f) => `
          <div class="flag">
            <span class="dot" style="background:${f.tone === "good" ? T.green : f.tone === "watch" ? T.amber : T.red}"></span>
            <div><div class="t">${esc(f.label)}</div><div class="d">${esc(f.detail)}</div></div>
          </div>`).join("")}
      </div>
    </div>

    <div>
      <div class="panel" style="text-align:center">
        <div class="eyebrow muted">Statement score</div>
        ${scoreDial(r.score.value, r.score.min, r.score.max, r.score.band, 46)}
        <div style="margin-top:-1mm">
          <div style="font-family:'JetBrains Mono',monospace;font-size:12pt;font-weight:700;letter-spacing:.12em;color:${bandColour(r)}">${esc(r.score.band.toUpperCase())}</div>
          <div style="font-size:7.8pt;color:${T.inkMuted};margin-top:0.6mm">probability of default ${pct(r.score.pd, 1)}</div>
        </div>
        <div class="note" style="margin-top:3mm;text-align:left;border-left-color:${T.hairline}">
          Read from this statement alone. It is not a credit reference bureau score and it is not
          Metropol&rsquo;s. Section 6 shows every driver and the weight this member gave it.
        </div>
      </div>

      <div class="panel tight" style="margin-top:4mm">
        <div class="eyebrow muted">Debt service ratio</div>
        <div style="display:flex;align-items:baseline;gap:3mm;margin-top:1mm">
          <span style="font-family:'JetBrains Mono',monospace;font-size:20pt;font-weight:700;color:${a.currentDsr > r.policy.affordability.dsrCap ? T.red : T.ink}">${pct(a.currentDsr)}</span>
          <span style="font-size:8pt;color:${T.inkMuted}">now</span>
          <span style="color:${T.inkMuted}">→</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:15pt;font-weight:700;color:${a.projectedDsr > r.policy.affordability.dsrCap ? T.red : T.green}">${pct(a.projectedDsr)}</span>
          <span style="font-size:8pt;color:${T.inkMuted}">if granted</span>
        </div>
        <div class="s" style="font-size:7.6pt;color:${T.inkMuted};margin-top:1.5mm">
          This member&rsquo;s cap is ${pct(r.policy.affordability.dsrCap)}.
        </div>
      </div>
    </div>
  </div>

  <div class="panel flat" style="margin-top:4mm">
    <p style="margin:0;font-size:8.8pt;line-height:1.5">${esc(r.narrative[0] ?? "")}</p>
    ${worstFlag ? `<p style="margin:2mm 0 0;font-size:8.8pt;line-height:1.5;color:${T.ink}"><strong>${esc(worstFlag.label)}.</strong> ${esc(worstFlag.detail)}</p>` : ""}
    <div class="source" style="margin-top:2.5mm">
      Read from an M-PESA statement supplied by ${esc(meta.requestedBy.organisation)} · SHA-256 ${esc(meta.fileSha256.slice(0, 20))}…${meta.consentRef ? ` · consent ${esc(meta.consentRef)}` : ""}
    </div>
  </div>
</div>`,
  };
}

// ── Page 2 · the statement as Safaricom printed it ───────────────────────────

function statementPage(r: CashflowReport, meta: CashflowDocMeta): TheatrePage {
  const s = r.summary;
  const rec = r.reconciliation;

  const inParts = s.rows.filter((row) => row.paidIn > 0).map((row, i) => ({ label: row.label, value: row.paidIn, colour: SERIES[i % SERIES.length] }));
  const outParts = s.rows.filter((row) => row.paidOut > 0).map((row, i) => ({ label: row.label, value: row.paidOut, colour: SERIES[i % SERIES.length] }));

  const summaryRows = s.rows
    .map((row) => `<tr>
      <td class="name">${esc(row.label)}</td>
      <td class="n" style="color:${row.paidIn > 0 ? T.green : T.inkMuted}">${row.paidIn > 0 ? kes(row.paidIn) : "—"}</td>
      <td class="n" style="color:${row.paidOut > 0 ? T.red : T.inkMuted}">${row.paidOut > 0 ? kes(row.paidOut) : "—"}</td>
    </tr>`)
    .join("");

  return {
    body: `
<div class="eyebrow">Section 1</div>
<h2>The statement, as Safaricom printed it</h2>
<p>
  Everything in this report is computed from one document. This page reproduces that document&rsquo;s own header and
  summary, unaltered, and totals our reading of its ${r.period.txnCount.toLocaleString("en-KE")} transaction rows against
  it. If the two do not agree, the rest of the report is worth less, so the comparison is printed rather than assumed.
</p>

<div class="split" style="margin-top:4mm">
  <div class="panel">
    <div class="eyebrow muted">Transaction summary · as printed</div>
    <table style="margin-top:1mm">
      <thead><tr><th>Transaction type</th><th class="n">Paid in</th><th class="n">Paid out</th></tr></thead>
      <tbody>${summaryRows}</tbody>
      ${s.printedTotal ? `<tfoot><tr>
        <td class="name" style="border-top:1.5px solid ${T.hairline};padding-top:2.6mm">Total, as printed</td>
        <td class="n" style="border-top:1.5px solid ${T.hairline};padding-top:2.6mm;color:${T.green};font-weight:700">${kes(s.printedTotal.paidIn)}</td>
        <td class="n" style="border-top:1.5px solid ${T.hairline};padding-top:2.6mm;color:${T.red};font-weight:700">${kes(s.printedTotal.paidOut)}</td>
      </tr>
      ${s.computedTotal && s.footsExactly === false ? `<tr>
        <td class="name" style="color:${T.amber}">Sum of the rows above<span class="sub">Safaricom&rsquo;s own summary does not foot. Both figures are reproduced as printed; neither has been corrected.</span></td>
        <td class="n" style="color:${T.amber}">${kes(s.computedTotal.paidIn)}</td>
        <td class="n" style="color:${T.amber}">${kes(s.computedTotal.paidOut)}</td>
      </tr>` : ""}</tfoot>` : ""}
    </table>
  </div>

  <div>
    <div class="panel tight">
      <div class="eyebrow muted">Statement header</div>
      <table style="margin-top:1mm;font-size:8.2pt">
        <tbody>
          <tr><td style="color:${T.inkMuted};width:32mm">Account holder</td><td class="name">${esc(s.header.customerName ?? "—")}</td></tr>
          <tr><td style="color:${T.inkMuted}">Mobile number</td><td class="name">${esc(s.header.mobileNumber ?? "—")}</td></tr>
          <tr><td style="color:${T.inkMuted}">Statement period</td><td class="name">${esc(s.header.periodLabel ?? "—")}</td></tr>
          <tr><td style="color:${T.inkMuted}">Requested on</td><td class="name">${esc(s.header.requestDate ?? "—")}</td></tr>
          <tr><td style="color:${T.inkMuted}">Months in period</td><td class="name">${r.period.months}<span class="sub">${esc(MONTHS_BASIS_LABEL[r.policy.income.monthsBasis].title)}. ${r.period.observedMonths} calendar month${r.period.observedMonths === 1 ? "" : "s"} carry rows.</span></td></tr>
        </tbody>
      </table>
    </div>

    <div class="panel tight" style="margin-top:4mm">
      <div class="eyebrow muted">Our reading against theirs</div>
      <div class="grid g2" style="margin-top:2mm">
        <div class="tile ${(rec.coverageIn ?? 1) >= 0.99 ? "" : "warn"}" style="padding:3mm">
          <div class="k">Paid in, read</div>
          <div class="v" style="font-size:13pt">${rec.coverageIn !== null ? pct(rec.coverageIn, 1) : "—"}</div>
          <div class="s">${kes(rec.parsed.paidIn)} of ${kes(rec.printed?.paidIn ?? 0)}</div>
        </div>
        <div class="tile ${(rec.coverageOut ?? 1) >= 0.99 ? "" : "warn"}" style="padding:3mm">
          <div class="k">Paid out, read</div>
          <div class="v" style="font-size:13pt">${rec.coverageOut !== null ? pct(rec.coverageOut, 1) : "—"}</div>
          <div class="s">${kes(rec.parsed.paidOut)} of ${kes(rec.printed?.paidOut ?? 0)}</div>
        </div>
      </div>
      <div class="note" style="margin-top:3mm">${esc(rec.note)}</div>
    </div>
  </div>
</div>

<div class="panel" style="margin-top:4mm">
  <div class="eyebrow muted">Where the money came from</div>
  ${compositionBar(inParts, { heightMm: 26 })}
</div>

<div class="panel" style="margin-top:4mm">
  <div class="eyebrow muted">Where the money went</div>
  ${compositionBar(outParts, { heightMm: 26 })}
  <div class="source">Both bars are Safaricom&rsquo;s own summary categories, not the Interchange&rsquo;s. Our classification of the same money begins on page 4.</div>
</div>`,
  };
}

// ── Page 3 · income ──────────────────────────────────────────────────────────

function incomePage(r: CashflowReport): TheatrePage {
  // `m.income` is the month on the MEMBER'S CHOSEN BASIS and `m.moneyOut` is
  // every debit as parsed. Both tie to Safaricom's own totals, so the bars, the
  // average line and the headline on page one are all the same measurement —
  // which is the only reason the average line can be checked by eye.
  const bars = r.monthly.map((m) => ({
    label: m.label,
    income: m.income,
    outflow: m.moneyOut,
    borrowed: m.borrowed,
    net: m.net,
    active: m.active,
  }));

  return {
    body: `
<div class="eyebrow">Section 2</div>
<h2>Income and expenditure, month by month</h2>
<p>
  The dashed line is the average monthly income this report uses everywhere else. It is drawn on the same axis as the
  bars so it can be checked rather than believed: months above it carried the average, months below were carried by
  the others. The amber band inside each green bar is the part of that month&rsquo;s money in that was <em>borrowed</em>
  rather than earned.
</p>

<div class="panel" style="margin-top:3mm">
  ${incomeExpenditureChart(bars, r.income.perMonth, { heightMm: 58, avgLabel: "Avg monthly income" })}
</div>

<div class="panel" style="margin-top:4mm">
  <div class="eyebrow muted">Net position each month · income less spending, cash out, charges and debt service</div>
  ${netCashflowChart(r.monthly.map((m) => ({ label: m.label, net: m.net, active: m.active })), 30)}
</div>

<div class="grid g4" style="margin-top:4mm">
  <div class="tile"><div class="k">Income volatility</div><div class="v">${r.volatility.toFixed(2)}</div><div class="s">${r.volatility <= r.policy.thresholds.volatilityStable ? "Stable" : r.volatility >= r.policy.thresholds.volatilityErratic ? "Erratic" : "Moderate"} against this member&rsquo;s thresholds</div></div>
  <div class="tile"><div class="k">Months with income</div><div class="v">${pct(r.earningMonthsRatio)}</div><div class="s">${r.monthly.filter((m) => m.income > 0).length} of ${r.monthly.length}</div></div>
  <div class="tile"><div class="k">Average balance</div><div class="v">${kesCompact(r.balances.average)}</div><div class="s">Low point ${kes(r.balances.minimum)}</div></div>
  <div class="tile"><div class="k">Balance trend</div><div class="v" style="color:${r.balances.trend >= 0 ? T.green : T.red}">${r.balances.trend >= 0 ? "+" : "−"}${kesCompact(Math.abs(r.balances.trend))}</div><div class="s">Close ${kes(r.balances.closing)} against open ${kes(r.balances.opening)}</div></div>
</div>`,
  };
}

/**
 * What counts as income, and the month-by-month ledger behind it.
 *
 * Its own page because it is the page a credit manager turns to when they
 * disagree with the number on the cover. Squeezed under the charts it was the
 * first thing to fall off the bottom, which is precisely backwards.
 */
function incomeBasisPage(r: CashflowReport): TheatrePage {
  const ladder = [
    { l: r.income.basisTitle, sub: r.income.basisDetail, v: r.income.grossTotal },
    ...r.income.deductions.map((d) => ({ l: `Less ${d.label.toLowerCase()}`, sub: d.why, v: -d.amount })),
  ];

  return {
    body: `
<div class="eyebrow">Section 2, continued</div>
<h2>What counts as income here</h2>

<div class="split" style="margin-top:3mm">
  <div class="panel">
    <div class="eyebrow muted">How the headline income was reached</div>
    ${ladder.map((s) => `
      <div class="step">
        <div class="l">${esc(s.l)}<small>${esc(s.sub)}</small></div>
        <div class="v" style="color:${s.v < 0 ? T.red : T.ink}">${s.v < 0 ? "−" : ""}${kes(Math.abs(s.v))}</div>
      </div>`).join("")}
    <div class="step total">
      <div class="l">Income used, per month<small>${kes(r.income.total)} ÷ ${r.income.months} months · ${esc(r.income.monthsDetail)}</small></div>
      <div class="v">${kes(r.income.perMonth)}</div>
    </div>
  </div>

  <div class="panel">
    <div class="eyebrow muted">The same statement, read the other ways</div>
    <p style="font-size:8.2pt;margin-bottom:2mm">
      Average monthly income is a choice, not a fact. These are the same transactions under this member&rsquo;s other
      available definitions. Changing the setting changes every figure in this report, including the instalment ceiling.
    </p>
    <table>
      <thead><tr><th>Basis</th><th class="n">Per month</th></tr></thead>
      <tbody>
        <tr>
          <td class="name">${esc(r.income.basisTitle)} ${toneChip("good", "in use")}</td>
          <td class="n" style="color:${T.green};font-weight:700">${kes(r.income.perMonth)}</td>
        </tr>
        ${r.income.alternatives.map((a) => `<tr>
          <td class="name" style="font-weight:400;color:${T.inkSecondary}">${esc(a.title)}<span class="sub">${esc(INCOME_BASIS_LABEL[a.key as keyof typeof INCOME_BASIS_LABEL]?.detail ?? "")}</span></td>
          <td class="n">${kes(a.perMonth)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
</div>

<div class="panel" style="margin-top:4mm">
  <div class="eyebrow muted">The ledger behind the chart</div>
  <table style="margin-top:1mm">
    <thead><tr>
      <th>Month</th><th class="n">Money in</th><th class="n">Of which borrowed</th>
      <th class="n">Income used</th><th class="n">Money out</th><th class="n">Debt service</th><th class="n">Net</th><th class="n">Rows</th>
    </tr></thead>
    <tbody>
      ${r.monthly.map((m) => `<tr${m.active ? "" : ` style="opacity:.45"`}>
        <td class="name">${esc(m.label)}${m.active ? "" : `<span class="sub">no activity</span>`}</td>
        <td class="n">${kes(m.moneyIn)}</td>
        <td class="n" style="color:${m.borrowed > 0 ? T.amber : T.inkMuted}">${m.borrowed > 0 ? kes(m.borrowed) : "—"}</td>
        <td class="n" style="color:${T.green}">${kes(m.income)}</td>
        <td class="n">${kes(m.moneyOut)}</td>
        <td class="n" style="color:${m.repaid > 0 ? T.red : T.inkMuted}">${m.repaid > 0 ? kes(m.repaid) : "—"}</td>
        <td class="n" style="color:${m.net >= 0 ? T.green : T.red}">${m.net < 0 ? "−" : ""}${kes(Math.abs(m.net))}</td>
        <td class="n" style="color:${T.inkMuted}">${m.txns.toLocaleString("en-KE")}</td>
      </tr>`).join("")}
    </tbody>
    <tfoot><tr>
      <td class="name" style="border-top:1.5px solid ${T.hairline};padding-top:2.4mm">Period</td>
      <td class="n" style="border-top:1.5px solid ${T.hairline};padding-top:2.4mm">${kes(r.reconciliation.parsed.paidIn)}</td>
      <td class="n" style="border-top:1.5px solid ${T.hairline};padding-top:2.4mm;color:${T.amber}">${kes(r.totals.borrowed)}</td>
      <td class="n" style="border-top:1.5px solid ${T.hairline};padding-top:2.4mm;color:${T.green};font-weight:700">${kes(r.income.total)}</td>
      <td class="n" style="border-top:1.5px solid ${T.hairline};padding-top:2.4mm">${kes(r.reconciliation.parsed.paidOut)}</td>
      <td class="n" style="border-top:1.5px solid ${T.hairline};padding-top:2.4mm;color:${T.red}">${kes(r.totals.repaid)}</td>
      <td class="n" style="border-top:1.5px solid ${T.hairline};padding-top:2.4mm"></td>
      <td class="n" style="border-top:1.5px solid ${T.hairline};padding-top:2.4mm;color:${T.inkMuted}">${r.period.txnCount.toLocaleString("en-KE")}</td>
    </tr></tfoot>
  </table>
  <div class="source">Money in and money out are every credit and debit as parsed; they total to Safaricom&rsquo;s own PAID IN and PAID OUT figures on page 2.</div>
</div>`,
  };
}

// ── Page 4 · spending ────────────────────────────────────────────────────────

function spendingPage(r: CashflowReport): TheatrePage {
  const cats = r.spendByCategory.slice(0, 10).map((c, i) => ({
    label: c.category,
    value: c.amount,
    sub: `${pct(c.share)} of money out · ${c.count.toLocaleString("en-KE")} rows · ${c.topCounterparties.slice(0, 2).map((p) => p.name).join(", ")}`,
    colour: c.category === "Loan repayments" ? T.redFill : c.category === "Betting" ? T.red : c.category === "Savings" || c.category === "Savings & investments" ? T.green : SERIES[i % SERIES.length],
  }));

  const parties = r.topCounterparties.slice(0, 12);

  return {
    body: `
<div class="eyebrow">Section 3</div>
<h2>Where the money goes</h2>
<p>
  Our classification, not Safaricom&rsquo;s. Debt service is separated from spending, because a payment to a licensed
  credit provider is a commitment that competes with a new instalment, and one filed beside the supermarket is a
  commitment nobody counted.
</p>

<div class="panel" style="margin-top:3mm">
  <div class="eyebrow muted">By category</div>
  ${rankedBars(cats, { heightMm: Math.min(58, cats.length * 5.6) })}
</div>

<div class="split" style="margin-top:4mm">
  <div class="panel">
    <div class="eyebrow muted">Largest counterparties</div>
    <table style="margin-top:1mm">
      <thead><tr><th>Counterparty</th><th class="n">Paid</th><th class="n">Rows</th></tr></thead>
      <tbody>
        ${parties.map((p) => `<tr>
          <td class="name">${esc(p.name)} ${p.lender ? toneChip("bad", "lender") : ""}</td>
          <td class="n">${kes(p.amount)}</td>
          <td class="n" style="color:${T.inkMuted}">${p.count.toLocaleString("en-KE")}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>

  <div>
    <div class="panel">
      <div class="eyebrow muted">What kind of account this is</div>
      <div style="display:flex;align-items:baseline;gap:3mm">
        <span style="font-size:13pt;font-weight:700;color:${r.business.isTrader ? T.green : T.ink}">
          ${r.business.isTrader ? "Trading account" : "Personal wallet"}
        </span>
        <span class="chip ${r.business.isTrader ? "good" : "mute"}">confidence ${pct(r.business.confidence)}</span>
      </div>
      ${r.business.signals.length
        ? `<ul style="margin:2.5mm 0 0;padding-left:4mm;font-size:8.2pt;color:${T.inkSecondary};line-height:1.5">
             ${r.business.signals.map((s) => `<li style="margin-bottom:1.2mm">${esc(s)}</li>`).join("")}
           </ul>`
        : `<p style="font-size:8.2pt;margin-top:2mm">Nothing in this statement suggests a business counter behind it.</p>`}
      ${r.business.suppliers.length
        ? `<div class="note" style="margin-top:3mm">
             Supplier-shaped spend: ${r.business.suppliers.map((s) => `${esc(s.name)} (${K(s.amount)}, ${s.count} payments)`).join("; ")}.
             Stock purchase is a cost of doing business, not consumption — which is why gross turnover flatters a
             trader&rsquo;s capacity and why the income basis on page 3 matters most for accounts like this one.
           </div>`
        : ""}
    </div>

    <div class="panel" style="margin-top:4mm">
      <div class="eyebrow muted">Money out, at a glance</div>
      <table style="margin-top:1mm">
        <tbody>
          <tr><td class="name">Spending</td><td class="n">${K(r.totals.spend)}</td></tr>
          <tr><td class="name">Debt service</td><td class="n" style="color:${T.red}">${K(r.totals.repaid)}</td></tr>
          <tr><td class="name">Cash withdrawn</td><td class="n">${K(r.totals.cashOut)}</td></tr>
          <tr><td class="name">To bank and SACCO accounts<span class="sub">${r.policy.affordability.countBankTransfersAsSpend ? "Counted as spending on this member&rsquo;s settings." : "Not counted as spending: money moved to an account is still the customer&rsquo;s."}</span></td><td class="n">${K(r.totals.bankTransfers)}</td></tr>
          <tr><td class="name">Into savings and funds</td><td class="n" style="color:${T.green}">${K(r.totals.saved)}</td></tr>
          <tr><td class="name">Betting</td><td class="n" style="color:${r.totals.gambling > 0 ? T.red : T.inkMuted}">${K(r.totals.gambling)}</td></tr>
          <tr><td class="name">M-PESA charges<span class="sub">${K(r.perMonth.charges)} a month</span></td><td class="n">${K(r.totals.charges)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>`,
  };
}

// ── Page 5 · lenders ─────────────────────────────────────────────────────────

function lenderRows(lenders: CashflowReport["lenders"]): string {
  return lenders
    .map((l) => `<tr>
      <td class="name">
        ${esc(l.name)} ${categoryChip(l.category, l.unregistered)}
        <span class="sub">${esc(l.evidence)}</span>
      </td>
      <td class="n">${l.repaid > 0 ? kes(l.repaid) : "—"}<span class="sub">${l.monthlyCommitment > 0 ? `${kes(l.monthlyCommitment)}/mo` : ""}</span></td>
      <td class="n">${l.borrowed > 0 ? kes(l.borrowed) : "—"}</td>
      <td class="n" style="color:${T.inkMuted}">${l.events}<span class="sub">${l.monthsActive} mo${l.cadenceDays ? ` · every ~${l.cadenceDays}d` : ""}</span></td>
    </tr>`)
    .join("");
}

function lenderPage(r: CashflowReport, from: number, to: number): TheatrePage {
  const shown = r.lenders.slice(from, to);
  const more = Math.max(0, r.lenders.length - to);

  return {
    body: `
<div class="eyebrow">Section 4</div>
<h2>Who else this borrower owes</h2>
<p>
  Every counterparty on the statement was put against the Central Bank of Kenya&rsquo;s registers of digital credit
  providers, commercial banks and microfinance banks, and against SASRA&rsquo;s deposit-taking SACCOs —
  ${REGISTRY_STATS.total} institutions in total, matched first by M-PESA shortcode and then by registered name. Each row
  below carries the evidence for calling it a lender.
</p>

<div class="grid g4" style="margin-top:3mm">
  <div class="tile ${r.lenderTotals.count > r.policy.thresholds.lenderCountWatch ? "bad" : ""}"><div class="k">Credit providers</div><div class="v">${r.lenderTotals.count}</div><div class="s">${r.lenderTotals.registered} on a register, ${r.lenderTotals.unregistered} on none</div></div>
  <div class="tile"><div class="k">Monthly commitment</div><div class="v">${kesCompact(r.lenderTotals.monthlyCommitment)}</div><div class="s">${pct(r.lenderTotals.monthlyCommitment / Math.max(1, r.income.perMonth))} of income</div></div>
  <div class="tile ${r.lenderTotals.dependencyRatio > r.policy.thresholds.loanDependencyWatch ? "bad" : ""}"><div class="k">Borrowed share of money in</div><div class="v">${pct(r.lenderTotals.dependencyRatio)}</div><div class="s">${K(r.totals.borrowed)} drawn over the period</div></div>
  <div class="tile ${r.lenderTotals.fulizaEvents > r.policy.thresholds.fulizaEvents * 10 ? "bad" : ""}"><div class="k">Fuliza draw-downs</div><div class="v">${r.lenderTotals.fulizaEvents.toLocaleString("en-KE")}</div><div class="s">Times the wallet reached zero and kept going</div></div>
</div>

<div class="panel" style="margin-top:4mm">
  <table>
    <thead><tr><th>Credit provider and the evidence</th><th class="n">Repaid</th><th class="n">Drawn</th><th class="n">Events</th></tr></thead>
    <tbody>${lenderRows(shown) || `<tr><td colspan="4" style="color:${T.inkMuted}">No credit provider appears on this statement.</td></tr>`}</tbody>
  </table>
  ${more ? `<div class="source" style="margin-top:2.5mm">${more} further credit provider${more === 1 ? "" : "s"} continue overleaf.</div>` : ""}
</div>

<div class="source">
  Glossary compiled ${esc(REGISTRY_STATS.compiledOn)} from: ${REGISTRY_STATS.sources.map(esc).join(" · ")}.
  A shortcode match is certain; a registered-name match is near-certain; a legal-form match is the Interchange&rsquo;s
  reading and is labelled as such on the row.
</div>`,
  };
}

/**
 * The rest of the lenders, and the commitment calendar.
 *
 * The calendar is the point of this page. A table of totals cannot distinguish
 * five lenders being paid in the same week from five spread across a year, and
 * those are different risks: the first is a borrower rolling one loan into the
 * next, the second is a borrower with a diversified and probably deliberate
 * credit history.
 */
function lenderContinuationPage(r: CashflowReport, from: number): TheatrePage {
  const rest = r.lenders.slice(from);
  const unregistered = r.lenders.filter((l) => l.unregistered);
  const offRail = r.lenders.filter((l) => l.borrowed > 0 && l.repaid < l.borrowed * 0.25);

  return {
    body: `
<div class="eyebrow">Section 4, continued</div>
<h2>The shape of the commitment</h2>

${rest.length ? `
<div class="panel">
  <table>
    <thead><tr><th>Credit provider and the evidence</th><th class="n">Repaid</th><th class="n">Drawn</th><th class="n">Events</th></tr></thead>
    <tbody>${lenderRows(rest)}</tbody>
  </table>
</div>` : ""}

${r.lenders.length >= 2 ? `
<div class="panel" style="margin-top:4mm">
  <div class="eyebrow muted">Who was paid, in which month</div>
  <p style="font-size:8.2pt;margin-bottom:2mm">
    Each row is shaded against its own busiest month, so a lender taking KES 400 and one taking KES 238,000 both show
    their rhythm. A solid row is a standing commitment; a single dark cell is a loan taken and cleared; several rows
    lighting up together is stacking. What each one costs is the column on the previous page.
  </p>
  ${commitmentGrid(r.lenders.slice(0, 12).map((l) => ({ name: l.name, byMonth: l.byMonth })), r.monthly.map((m) => m.label))}
</div>` : ""}

${unregistered.length ? `
<div class="panel" style="margin-top:4mm;border-color:rgba(255,107,107,0.35);background:rgba(255,107,107,0.06)">
  <div class="eyebrow" style="color:${T.red}">On no register held here</div>
  <p style="font-size:8.6pt;margin:0">
    ${unregistered.map((l) => `<strong>${esc(l.name)}</strong> took ${K(l.repaid)} across ${l.events} payments${l.accountRefs.length ? ` against account ${esc(l.accountRefs[0])}` : ""}`).join("; ")}.
    The name is unmistakably a credit business, so the payments are counted as debt service — but the company does not
    appear on the CBK digital credit provider register, the banking registers, or SASRA&rsquo;s. A borrower servicing an
    unlicensed lender carries an exposure no bureau records and no regulator can help them with.
  </p>
</div>` : ""}

${offRail.length ? `
<div class="panel" style="margin-top:4mm;border-color:rgba(255,194,77,0.35);background:rgba(255,194,77,0.06)">
  <div class="eyebrow" style="color:${T.amber}">Debt serviced somewhere this statement cannot see</div>
  <p style="font-size:8.6pt;margin:0">
    ${offRail.map((l) => `<strong>${esc(l.name)}</strong> advanced ${K(l.borrowed)} and only ${K(l.repaid)} of repayment appears here`).join("; ")}.
    The instalments are being paid off the M-PESA rail — most often by standing order from a bank account. The monthly
    commitment on the previous page is therefore a FLOOR, not a total, and an exposure query or a bureau pull is the
    way to find the rest.
  </p>
</div>` : ""}`,
  };
}

// ── Page 6 · affordability ───────────────────────────────────────────────────

function affordabilityPage(r: CashflowReport): TheatrePage {
  const a = r.affordability;
  const p = r.policy.affordability;

  return {
    body: `
<div class="eyebrow">Section 5</div>
<h2>What they can afford</h2>
<p>
  Every step below is shown so the answer can be argued with rather than merely accepted. The settings in the right-hand
  column belong to ${esc(r.policy.label)} — another member crunching this same statement on their own settings will get a
  different, equally defensible, number.
</p>

<div class="split" style="margin-top:3mm">
  <div class="panel">
    <div class="eyebrow muted">The arithmetic</div>
    ${a.workings.slice(0, -1).map((w) => `
      <div class="step">
        <div class="l">${esc(w.step)}<small>${esc(w.detail)}</small></div>
        <div class="v" style="color:${(w.value ?? 0) < 0 ? T.red : T.ink}">${w.value === null ? "" : `${w.value < 0 ? "−" : ""}${kes(Math.abs(w.value))}`}</div>
      </div>`).join("")}
    <div class="step total ${a.recommendedMaxInstallment === 0 ? "zero" : ""}">
      <div class="l">Comfortable instalment<small>${esc(a.workings[a.workings.length - 1]?.detail ?? "")}</small></div>
      <div class="v">${a.recommendedMaxInstallment > 0 ? `${kes(a.recommendedMaxInstallment)}/mo` : "Nothing"}</div>
    </div>
  </div>

  <div>
    <div class="panel tight">
      <div class="eyebrow muted">Settings used</div>
      <table style="margin-top:1mm;font-size:8pt">
        <tbody>
          <tr><td style="color:${T.inkMuted};width:38mm">Method</td><td class="name">${esc(METHOD_LABEL[a.method].title)}</td></tr>
          <tr><td style="color:${T.inkMuted}">Debt service cap</td><td class="name">${pct(p.dsrCap)} of income</td></tr>
          <tr><td style="color:${T.inkMuted}">Share of surplus</td><td class="name">${pct(p.surplusShare)}</td></tr>
          <tr><td style="color:${T.inkMuted}">Existing commitments</td><td class="name">${p.deductExistingCommitments ? "Deducted" : "Not deducted"}</td></tr>
          <tr><td style="color:${T.inkMuted}">Floor</td><td class="name">${K(p.floorKes)}</td></tr>
          <tr><td style="color:${T.inkMuted}">Ceiling</td><td class="name">${p.ceilingKes ? K(p.ceilingKes) : "None"}</td></tr>
          <tr><td style="color:${T.inkMuted}">Rounding</td><td class="name">Down to ${K(p.roundToKes)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="panel tight" style="margin-top:4mm">
      <div class="eyebrow muted">Both routes, side by side</div>
      <div class="grid g2" style="margin-top:2mm">
        <div class="tile" style="padding:3mm">
          <div class="k">Debt service route</div>
          <div class="v" style="font-size:12pt">${kes(a.dsrCeiling ?? 0)}</div>
          <div class="s">${pct(p.dsrCap)} of ${kes(r.income.perMonth)}${p.deductExistingCommitments ? `, less ${kes(a.existingCommitments)}` : ""}</div>
        </div>
        <div class="tile" style="padding:3mm">
          <div class="k">Surplus route</div>
          <div class="v" style="font-size:12pt">${kes(a.surplusCeiling ?? 0)}</div>
          <div class="s">${pct(p.surplusShare)} of ${kes(r.perMonth.net)} left over</div>
        </div>
      </div>
      <div class="note" style="margin-top:3mm">
        ${a.method === "lower_of_both"
          ? `The lower of the two is taken. Where they disagree sharply, the gap is itself the finding: a wide debt-service
             ceiling and a narrow surplus means income exists but is already spoken for.`
          : esc(METHOD_LABEL[a.method].detail)}
      </div>
    </div>

    <div class="panel tight" style="margin-top:4mm">
      <div class="eyebrow muted">If this instalment were granted</div>
      <table style="margin-top:1mm;font-size:8.2pt">
        <tbody>
          <tr><td style="color:${T.inkMuted};width:38mm">Debt service now</td><td class="n" style="color:${a.currentDsr > p.dsrCap ? T.red : T.ink}">${pct(a.currentDsr)}</td></tr>
          <tr><td style="color:${T.inkMuted}">Debt service after</td><td class="n" style="color:${a.projectedDsr > p.dsrCap ? T.red : T.green}">${pct(a.projectedDsr)}</td></tr>
          <tr><td style="color:${T.inkMuted}">Surplus after</td><td class="n">${K(r.perMonth.net - a.recommendedMaxInstallment)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<div class="panel flat" style="margin-top:4mm">
  ${r.narrative.slice(1).map((n) => `<p style="font-size:8.8pt;line-height:1.55;margin-bottom:2.2mm">${esc(n)}</p>`).join("")}
</div>`,
  };
}

// ── Page 7 · the score ───────────────────────────────────────────────────────

function scorePage(r: CashflowReport): TheatrePage {
  return {
    body: `
<div class="eyebrow">Section 6</div>
<h2>What moved the score</h2>
<p>
  The score starts at ${r.score.base} and every driver moves it. The track behind each bar is that driver&rsquo;s own maximum
  on this member&rsquo;s settings, so a bar at the end of its track means the factor is exhausted — no further
  deterioration in it can cost anything more, and no further improvement can earn anything more.
</p>

<div class="panel" style="margin-top:3mm">
  ${driverBars(r.score.drivers.map((d) => ({ title: d.title, points: d.points, weight: d.weight, detail: d.detail, enabled: d.enabled })), 118)}
</div>

<div class="split" style="margin-top:4mm">
  <div class="panel tight">
    <div class="eyebrow muted">Bands on this member&rsquo;s settings</div>
    <table style="margin-top:1mm">
      <thead><tr><th>From</th><th>Band</th><th class="n">Assumed default rate</th></tr></thead>
      <tbody>
        ${r.policy.score.bands.map((b) => `<tr style="${b.label === r.score.band ? `background:rgba(95,209,106,0.09)` : ""}">
          <td class="n" style="text-align:left">${b.min}</td>
          <td class="name">${esc(b.label)} ${b.label === r.score.band ? toneChip("good", "this statement") : ""}</td>
          <td class="n">${pct(b.pd, 1)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
  <div class="panel tight">
    <div class="eyebrow muted">What this score is not</div>
    <p style="font-size:8.4pt;line-height:1.5;margin:0">
      It is read from one M-PESA statement and nothing else. It does not know about loans that never touched this
      wallet, about accounts at a bank, or about anything a credit reference bureau holds. It is not Metropol&rsquo;s
      Metro-Score and the two are not comparable.
    </p>
    <p style="font-size:8.4pt;line-height:1.5;margin:2.5mm 0 0">
      The assumed default rate beside each band is this member&rsquo;s own configured expectation, not an observed
      outcome rate. It becomes an observed rate only once enough decisions made on these reports have matured.
    </p>
  </div>
</div>`,
  };
}

// ── Page 8 · method ──────────────────────────────────────────────────────────

function methodPage(r: CashflowReport, meta: CashflowDocMeta): TheatrePage {
  // Whose details stand behind this document — the member who requested it, not
  // the network operator. See letterheadFor() in ../brand.
  const lh = letterheadFor(meta.requestedBy.memberCode);
  const diff = policyDiff(r.policy);
  const qr = qrSvg(verifyUrl(meta.reference), 22, "#E8EDEA");

  return {
    body: `
<div class="eyebrow">Section 7</div>
<h2>Method, settings and provenance</h2>

<div class="split">
  <div>
    <div class="panel">
      <div class="eyebrow muted">How this report was produced</div>
      <table style="font-size:8.2pt">
        <tbody>
          <tr><td style="color:${T.inkMuted};width:42mm">Source document</td><td class="name">M-PESA statement supplied by ${esc(meta.requestedBy.organisation)}<span class="sub">SHA-256 ${esc(meta.fileSha256)}</span></td></tr>
          <tr><td style="color:${T.inkMuted}">Engine</td><td class="name">${esc(r.engineVersion)}<span class="sub">Parser, counterparty reader, lender matcher, feature engine, policy and scorecard</span></td></tr>
          <tr><td style="color:${T.inkMuted}">Policy</td><td class="name">${esc(r.policy.label)} · ${esc(r.policy.version)}<span class="sub">Last changed ${esc(r.policy.updatedAt)}${r.policy.updatedBy ? ` by ${esc(r.policy.updatedBy)}` : ""}</span></td></tr>
          <tr><td style="color:${T.inkMuted}">Rows read</td><td class="name">${r.period.txnCount.toLocaleString("en-KE")}<span class="sub">${r.reconciliation.coverageIn !== null ? `${pct(r.reconciliation.coverageIn, 1)} of the paid-in total Safaricom printed` : "no printed total to compare against"}</span></td></tr>
          <tr><td style="color:${T.inkMuted}">Requested by</td><td class="name">${esc(meta.requestedBy.person)}<span class="sub">${esc(meta.requestedBy.organisation)} · ${esc(meta.requestedBy.memberCode)}</span></td></tr>
          ${meta.consentRef ? `<tr><td style="color:${T.inkMuted}">Consent</td><td class="name">${esc(meta.consentRef)}</td></tr>` : ""}
        </tbody>
      </table>
    </div>

    <div class="panel" style="margin-top:4mm">
      <div class="eyebrow muted">Settings that differ from the Interchange default</div>
      ${diff.length
        ? `<table style="margin-top:1mm">
             <thead><tr><th>Setting</th><th>This member</th><th>Default</th></tr></thead>
             <tbody>${diff.map((d) => `<tr><td class="name">${esc(d.setting)}</td><td>${esc(d.value)}</td><td style="color:${T.inkMuted}">${esc(d.default)}</td></tr>`).join("")}</tbody>
           </table>`
        : `<p style="font-size:8.4pt;margin:1mm 0 0">None. This report was produced on the Interchange default settings exactly as shipped.</p>`}
    </div>

    <div class="panel" style="margin-top:4mm">
      <div class="eyebrow muted">Where the engine refused to guess</div>
      <table style="font-size:8.2pt">
        <tbody>
          <tr><td class="name">Credits it would not place<span class="sub">Arrived through shortcodes that carry payroll, supplier settlement and lending alike. Counted as neither income nor borrowing.</span></td><td class="n">${K(r.totals.unclassifiedCredits)}</td></tr>
          <tr><td class="name">Own-account transfers<span class="sub">The holder moving money between their own accounts. Removed so a sale is not counted twice.</span></td><td class="n">${K(r.totals.selfTransfers)}</td></tr>
          <tr><td class="name">Reversals<span class="sub">Money returned because it should not have left.</span></td><td class="n">${K(r.totals.reversals)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div>
    <div class="panel tight">
      <div class="eyebrow muted">Verify this document</div>
      <div style="display:flex;gap:4mm;align-items:flex-start;margin-top:1mm">
        <div style="flex:0 0 auto">${qr}</div>
        <div style="font-size:7.6pt;color:${T.inkSecondary};line-height:1.5">
          Scan or visit <strong>${esc(SERVICE_HOST)}/verify/${esc(meta.reference)}</strong> to confirm this document&rsquo;s
          reference and content hash against the Interchange message log. An altered copy will not verify.
        </div>
      </div>
    </div>

    <div class="panel tight" style="margin-top:4mm">
      <div class="eyebrow muted">Lender glossary</div>
      <table style="font-size:8pt;margin-top:1mm">
        <tbody>
          <tr><td style="color:${T.inkMuted}">Digital credit providers</td><td class="n">${REGISTRY_STATS.digitalCreditProviders}</td></tr>
          <tr><td style="color:${T.inkMuted}">Commercial banks</td><td class="n">${REGISTRY_STATS.banks}</td></tr>
          <tr><td style="color:${T.inkMuted}">Microfinance banks</td><td class="n">${REGISTRY_STATS.microfinanceBanks}</td></tr>
          <tr><td style="color:${T.inkMuted}">SACCOs</td><td class="n">${REGISTRY_STATS.saccos}</td></tr>
          <tr><td style="color:${T.inkMuted}">Asset finance and PAYGO</td><td class="n">${REGISTRY_STATS.assetFinance}</td></tr>
          <tr><td style="color:${T.inkMuted}">Mobile-money credit</td><td class="n">${REGISTRY_STATS.mobileMoneyCredit}</td></tr>
          <tr><td class="name" style="border-top:1px solid ${T.hairline}">Total institutions</td><td class="n" style="border-top:1px solid ${T.hairline};font-weight:700">${REGISTRY_STATS.total}</td></tr>
        </tbody>
      </table>
      <div class="source" style="margin-top:2mm">Compiled ${esc(REGISTRY_STATS.compiledOn)}.</div>
    </div>

    <div class="panel tight" style="margin-top:4mm">
      <div class="eyebrow muted">Issued by</div>
      <p style="font-size:8.2pt;line-height:1.55;margin:0">
        <strong>${esc(lh.legalName ?? lh.name)}</strong><br>
        ${lh.addressLines.map(esc).join("<br>")}<br>
        ${esc(lh.phone ?? "")} · ${esc(lh.email ?? "")}<br>
        ${esc(lh.website)}<br>
        <span style="color:${T.inkMuted}">
          Reg. ${esc(lh.companyRegistration ?? "—")}${lh.kraPin ? ` · KRA PIN ${esc(lh.kraPin)}` : ""}${lh.incorporatedOn ? `<br>Incorporated ${esc(lh.incorporatedOn)}` : ""}
        </span>
      </p>
    </div>
  </div>
</div>

<div class="panel flat" style="margin-top:4mm">
  <div class="eyebrow muted">About this document</div>
  <p style="font-size:7.8pt;line-height:1.55;margin:0;color:${T.inkMuted}">${esc(INTERCHANGE_STATEMENT_NOTICE)}</p>
</div>`,
  };
}
