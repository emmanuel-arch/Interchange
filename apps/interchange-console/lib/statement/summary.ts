// ─────────────────────────────────────────────────────────────────────────────
// THE STATEMENT'S OWN SUMMARY — Safaricom's arithmetic, read as evidence.
//
// Every official M-PESA statement opens with a header block and a seven-row
// summary that Safaricom computed themselves:
//
//    TRANSACTION TYPE            PAID IN       PAID OUT
//    SEND MONEY:                    0.00     234,780.00
//    RECEIVED MONEY:          345,522.17           0.00
//    AGENT DEPOSIT:            89,135.00           0.00
//    AGENT WITHDRAWAL:              0.00      32,540.00
//    LIPA NA M-PESA (PAYBILL): 85,036.98     147,582.00
//    LIPA NA M-PESA (BUY GOODS):17,555.50     29,921.00
//    OTHERS:                  137,733.00     240,209.15
//    TOTAL:                   685,032.15     685,032.15
//
// ── WHY THIS MATTERS MORE THAN IT LOOKS ──────────────────────────────────────
// Two reasons, and the second is the important one.
//
// 1. It is the ANCHOR. Our parser reads 20,000 rows out of a 224-page PDF. If
//    our totals and Safaricom's disagree, one of us is wrong, and the report
//    says so rather than quietly presenting a number that does not tie out.
//    A lender who adds up the appendix and gets a different answer from the
//    headline stops trusting the whole document, and they are right to.
//
// 2. It is the DECLARED PERIOD. "Statement Period: 02 Mar 2026 - 02 Sep 2026"
//    is six months whether or not the customer transacted in all six. Dividing
//    by the months we happened to OBSERVE flatters a dormant customer: three
//    quiet months disappear and the average income rises. Dividing by the
//    period Safaricom declared is the honest denominator, and it is what the
//    average-income line on every chart in this product is drawn from.
//
// Note on Safaricom's own totals: they do not always foot. On one statement
// read here the PAID IN column sums to 674,982.65 while the printed TOTAL says
// 685,032.15. We print what the document printed and show our own sum beside
// it. Correcting a bureau's or an operator's arithmetic silently is how a
// report stops being evidence.
// ─────────────────────────────────────────────────────────────────────────────

export type SummaryRow = {
  /** The label exactly as Safaricom printed it, less the colon. */
  label: string;
  /** A stable key for charts and configuration. */
  key: SummaryKey;
  paidIn: number;
  paidOut: number;
};

export type SummaryKey =
  | "send_money" | "received_money" | "agent_deposit" | "agent_withdrawal"
  | "paybill" | "buy_goods" | "others" | "total" | "unknown";

export type StatementHeader = {
  customerName: string | null;
  mobileNumber: string | null;
  email: string | null;
  /** As printed, e.g. "02 Mar 2026 - 02 Sep 2026". */
  periodLabel: string | null;
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null;   // YYYY-MM-DD
  requestDate: string | null; // YYYY-MM-DD
  /**
   * Whole months between the declared start and end, rounded to the nearest
   * month and never below 1. Six months and a day is six months, not seven.
   */
  periodMonths: number | null;
};

export type StatementSummary = {
  header: StatementHeader;
  rows: SummaryRow[];
  /** The TOTAL line as printed. Null when the statement had no summary block. */
  printedTotal: { paidIn: number; paidOut: number } | null;
  /** Our sum of the rows above TOTAL, for the reconciliation line. */
  computedTotal: { paidIn: number; paidOut: number } | null;
  /** True when the printed total and the sum of the printed rows agree to 1 KES. */
  footsExactly: boolean | null;
};

const KEYS: [RegExp, SummaryKey, string][] = [
  [/^SEND\s*MONEY$/i, "send_money", "Send money"],
  [/^RECEIVED?\s*MONEY$/i, "received_money", "Received money"],
  [/^AGENT\s*DEPOSIT$/i, "agent_deposit", "Agent deposit"],
  [/^AGENT\s*WITHDRAWALS?$/i, "agent_withdrawal", "Agent withdrawal"],
  [/^LIPA\s*NA\s*M-?PESA\s*\(?\s*PAY\s*BILL\s*\)?$/i, "paybill", "Lipa na M-PESA (Pay Bill)"],
  [/^LIPA\s*NA\s*M-?PESA\s*\(?\s*BUY\s*GOODS\s*\)?$/i, "buy_goods", "Lipa na M-PESA (Buy Goods)"],
  [/^OTHERS?$/i, "others", "Others"],
  [/^TOTALS?$/i, "total", "Total"],
];

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

const num = (s: string) => Number(s.replace(/,/g, ""));

/** "02 Mar 2026" → "2026-03-02". Null on anything else. */
function isoDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,4})\s+(\d{4})$/);
  if (!m) return null;
  const mo = MONTHS[m[2].toUpperCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function field(head: string, label: RegExp): string | null {
  const m = head.match(label);
  if (!m) return null;
  const v = m[1].replace(/\s{2,}/g, " ").trim().replace(/[.,;]+$/, "");
  return v.length ? v : null;
}

/**
 * Months between two ISO dates, to the nearest whole month, floor 1.
 *
 * 02 Mar → 02 Sep is exactly 6. 28 Feb → 30 Aug is 6 months and two days,
 * which rounds to 6 and not to 7 — an extra month in the denominator would
 * quietly lower every monthly average in the report by a sixth.
 */
export function monthsBetween(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00Z`);
  const b = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  const days = (b.getTime() - a.getTime()) / 86_400_000;
  return Math.max(1, Math.round(days / 30.4375));
}

/** Read the header block and the summary table from extracted statement text. */
export function readStatementSummary(text: string): StatementSummary {
  // The header and summary always sit in the first page's worth of text.
  const head = text.slice(0, 4000);

  const periodLabel = field(head, /Statement\s*Period\s*:?\s*([0-9]{1,2}\s+[A-Za-z]{3,4}\s+[0-9]{4}\s*[-–]\s*[0-9]{1,2}\s+[A-Za-z]{3,4}\s+[0-9]{4})/i);
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  if (periodLabel) {
    const [a, b] = periodLabel.split(/\s*[-–]\s*/);
    periodStart = isoDate(a ?? "");
    periodEnd = isoDate(b ?? "");
    // Safaricom occasionally prints the range newest-first in the filename and
    // oldest-first in the document. Order the pair rather than trust either.
    if (periodStart && periodEnd && periodStart > periodEnd) {
      [periodStart, periodEnd] = [periodEnd, periodStart];
    }
  }

  const requestRaw = field(head, /Request\s*Date\s*:?\s*([0-9]{1,2}\s+[A-Za-z]{3,4}\s+[0-9]{4})/i);

  const header: StatementHeader = {
    customerName: field(head, /Customer\s*Name\s*:?\s*([A-Za-z][A-Za-z' .-]{2,80}?)(?=\s{2,}|\s*Mobile|\s*Email|\n|$)/i),
    mobileNumber: field(head, /Mobile\s*Number\s*:?\s*([0-9+ ]{9,15})/i),
    email: field(head, /Email\s*Address\s*:?\s*([^\s]{5,60}@[^\s]{3,40})/i),
    periodLabel,
    periodStart,
    periodEnd,
    requestDate: requestRaw ? isoDate(requestRaw) : null,
    periodMonths: periodStart && periodEnd ? monthsBetween(periodStart, periodEnd) : null,
  };

  // ── The summary table ──────────────────────────────────────────────────────
  // Each line is "LABEL:  <money>  <money>". Anchored on the colon so a stray
  // money pair elsewhere on the page cannot be read as a summary row.
  const rows: SummaryRow[] = [];
  let printedTotal: StatementSummary["printedTotal"] = null;

  const lineRe = /^[ \t]*([A-Z][A-Za-z ()\-/]{2,40}?)\s*:\s*(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(head)) !== null) {
    const rawLabel = m[1].replace(/\s{2,}/g, " ").trim();
    const found = KEYS.find(([re]) => re.test(rawLabel.replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ")")));
    const key: SummaryKey = found ? found[1] : "unknown";
    const label = found ? found[2] : rawLabel;
    const paidIn = num(m[2]);
    const paidOut = num(m[3]);
    if (key === "total") {
      printedTotal = { paidIn, paidOut };
      continue;
    }
    if (key === "unknown") continue; // not a summary row; the table is fixed
    rows.push({ label, key, paidIn, paidOut });
  }

  const computedTotal = rows.length
    ? {
        paidIn: Number(rows.reduce((s, r) => s + r.paidIn, 0).toFixed(2)),
        paidOut: Number(rows.reduce((s, r) => s + r.paidOut, 0).toFixed(2)),
      }
    : null;

  const footsExactly =
    printedTotal && computedTotal
      ? Math.abs(printedTotal.paidIn - computedTotal.paidIn) < 1 && Math.abs(printedTotal.paidOut - computedTotal.paidOut) < 1
      : null;

  return { header, rows, printedTotal, computedTotal, footsExactly };
}

/**
 * The denominator every monthly figure in the report divides by.
 *
 * The statement's declared period wins when it is readable, because it is the
 * only number on the page that is true whether or not the customer transacted.
 * `observedMonths` is the fallback, and the report always says which was used.
 */
export function periodMonths(summary: StatementSummary, observedMonths: number): { months: number; basis: "declared" | "observed" } {
  const declared = summary.header.periodMonths;
  if (declared && declared > 0) return { months: declared, basis: "declared" };
  return { months: Math.max(1, observedMonths), basis: "observed" };
}
