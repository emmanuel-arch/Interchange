// ─────────────────────────────────────────────────────────────────────────────
// One parsed statement → the crunch answer the theatre plays and the lender
// downloads.
//
// Shared by the live crunch route and the preview build, so the demo is the
// engine's real output rather than a mock of it. The shape matches the lending
// console's cruncher, minus the product offer: the Interchange sizes what a
// borrower can afford; which product to lend is the member's own decision.
// ─────────────────────────────────────────────────────────────────────────────
import type { MpesaTxn } from "./mpesa-parser";
import { crunch, type CashflowFeatures, type Affordability, type MonthlyRow } from "./features";
import { analyzeStatement, type InternalReport } from "./analyze";
import { scoreThinFileAuto } from "./score-thinfile";
import type { ThinFileScore } from "./scorecard";

export type NameCheck = { statementName: string | null; expectedName: string; matched: boolean; overridden: boolean };

export type CrunchData = {
  nameCheck?: NameCheck | null;
  transactionCount: number;
  paidIn: number;
  paidOut: number;
  creditScore: ThinFileScore;
  features: CashflowFeatures;
  monthly: MonthlyRow[];
  affordability: Affordability;
  categories: { category: string; count: number; amount: number; inAmt: number; outAmt: number }[];
  /** A slice of the real ledger for the posting animation, not the whole book. */
  sample: { date: string; details: string; direction: "in" | "out"; amount: number; category: string }[];
  report: InternalReport;
};

export function assembleCrunch(txns: MpesaTxn[], nameCheck: NameCheck | null = null): CrunchData {
  const result = crunch(txns);
  const buckets = new Map<string, { count: number; amount: number; inAmt: number; outAmt: number }>();
  let paidIn = 0;
  let paidOut = 0;
  for (const t of txns) {
    const b = buckets.get(t.category) ?? { count: 0, amount: 0, inAmt: 0, outAmt: 0 };
    b.count++;
    b.amount += t.amount;
    if (t.direction === "in") {
      b.inAmt += t.amount;
      paidIn += t.amount;
    } else {
      b.outAmt += t.amount;
      paidOut += t.amount;
    }
    buckets.set(t.category, b);
  }
  return {
    nameCheck,
    transactionCount: txns.length,
    paidIn: Math.round(paidIn),
    paidOut: Math.round(paidOut),
    creditScore: scoreThinFileAuto(result.features),
    ...result,
    categories: [...buckets.entries()]
      .map(([category, v]) => ({ category, count: v.count, amount: Math.round(v.amount), inAmt: Math.round(v.inAmt), outAmt: Math.round(v.outAmt) }))
      .sort((a, b) => b.count - a.count),
    sample: txns.slice(-40).reverse().map((t) => ({
      date: t.date,
      details: t.details.slice(0, 48),
      direction: t.direction,
      amount: t.amount,
      category: t.category,
    })),
    report: analyzeStatement(txns),
  };
}
