// ─────────────────────────────────────────────────────────────────────────────
// THE CASHFLOW ENGINE — what report 11 is actually made of.
//
// ── THE FOUR THINGS THIS DOES THAT A KEYWORD CRUNCHER CANNOT ────────────────
//
// 1. IT NAMES THE LENDERS. Every counterparty is resolved to a shortcode and a
//    name and put against the CBK and SASRA registers (lenders.ts). A row that
//    reads "Pay Bill Fuliza M-Pesa to 4145907 - MULAR CREDIT LIMITED Acc.
//    7981717" is debt service to a licensed digital credit provider, not a
//    trip to the shops, and the KES 37,367 belongs under commitments rather
//    than under "where they spend".
//
// 2. IT DIVIDES BY THE RIGHT NUMBER. Monthly averages use the period the
//    statement DECLARES, not the months that happen to carry rows. A customer
//    who went quiet for three months of a twelve-month statement does not get
//    a 33% pay rise from our arithmetic.
//
// 3. IT TIES BACK TO THE DOCUMENT. Safaricom print their own totals on page
//    one. We total our parse against theirs and print the coverage. A report
//    whose headline cannot be checked against the source is a claim, not
//    evidence.
//
// 4. IT REFUSES TO GUESS. A credit from "Equity Bulk Account" might be salary,
//    might be a loan, might be an insurance payout. It gets its own line and
//    its own name. Three ambiguous buckets printed honestly beat one confident
//    number that is wrong a third of the time.
//
// ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
// Thresholds, weights and definitions. They are settings (policy.ts), the
// member owns them, and the report prints the ones it used.
// ─────────────────────────────────────────────────────────────────────────────

import type { MpesaTxn } from "./mpesa-parser";
import { readCounterparty, type Counterparty } from "./counterparty";
import { matchLender, isLender, coreName, type LenderMatch, type LenderCategory } from "./lenders";
import { readStatementSummary, periodMonths, type StatementSummary } from "./summary";
import {
  DEFAULT_POLICY, DRIVER_LABEL, INCOME_BASIS_LABEL, MONTHS_BASIS_LABEL, METHOD_LABEL,
  type CrunchPolicy, type ScoreDriverKey,
} from "./policy";

// ── What a row turned out to be ──────────────────────────────────────────────

export type FlowRole =
  /** Earned: a customer paid, a salary landed, a deposit was made. */
  | "income"
  /** Borrowed: a loan or overdraft was drawn. Money in, but not income. */
  | "borrowing"
  /** The holder moving their own money between their own accounts. */
  | "self_transfer"
  /** Money that came back because it should not have left. */
  | "reversal"
  /** A credit we cannot honestly place. Named, never assumed. */
  | "unclassified_credit"
  /** Debt service to an identified credit provider. */
  | "loan_repayment"
  /**
   * Money sent to a bank's or SACCO's general paybill.
   *
   * NOT debt service, and the distinction is expensive to get wrong. Equity's
   * 247247 takes school fees, rent, deposits into the customer's own account
   * and loan repayments through one number, and the row does not say which.
   * Counting all of it as a commitment took KES 23,921/mo off one borrower's
   * headroom on a first run of this engine — enough to turn an approvable
   * application into a decline on an assumption.
   */
  | "bank_transfer"
  /** Money moved into a savings product. */
  | "saving"
  /** Ordinary spending. */
  | "spend"
  /** Cash out at an agent or ATM. */
  | "cash_out"
  /** Safaricom's own fee. */
  | "charge";

export type EnrichedTxn = MpesaTxn & {
  counterparty: Counterparty;
  lender: LenderMatch | null;
  role: FlowRole;
  /** Why the role was chosen. Printed in the appendix for sampled rows. */
  roleReason: string;
};

// ── Results ──────────────────────────────────────────────────────────────────

export type MonthPoint = {
  month: string;          // YYYY-MM
  label: string;          // "Mar 26"
  /**
   * This month's income ON THE MEMBER'S CHOSEN BASIS.
   *
   * THE FIGURE THE CHARTS PLOT, and it has to be this one. A chart drawn from
   * classified-income rows under a headline that says "statement total paid in"
   * is two different measurements stacked on one axis: the average line floats
   * above every bar and the document cannot be checked against itself.
   */
  income: number;
  /** Every credit in the month, as parsed. Ties to the statement's PAID IN. */
  moneyIn: number;
  /** Every debit in the month, as parsed. Ties to the statement's PAID OUT. */
  moneyOut: number;
  /** Rows the classifier calls income, kept for the alternative bases. */
  classifiedIncome: number;
  borrowed: number;
  repaid: number;
  spend: number;
  cashOut: number;
  charges: number;
  bankTransfers: number;
  gambling: number;
  saved: number;
  net: number;            // income − (spend + cashOut + charges + repaid)
  txns: number;
  /** False for a month inside the declared period that carries no rows at all. */
  active: boolean;
};

export type LenderPosition = {
  key: string;
  name: string;
  category: LenderCategory;
  regulator: string;
  register: string;
  unregistered: boolean;
  confidence: number;
  method: LenderMatch["method"];
  evidence: string;
  /** The shortcodes this lender was seen on, in this statement. */
  codes: string[];
  /** The loan account references seen. This is what makes it a relationship. */
  accountRefs: string[];
  borrowed: number;
  repaid: number;
  events: number;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Repaid over the period, divided by the period. The running commitment. */
  monthlyCommitment: number;
  /** Months in which anything was paid to this lender. */
  monthsActive: number;
  /** Median days between payments. Null when there are fewer than two. */
  cadenceDays: number | null;
  /** Money moved in both directions with the same counterparty. */
  bidirectional: boolean;
  /**
   * Repaid in each month of the period, aligned to `monthly`.
   *
   * This is what makes stacking visible. Five lenders all being paid in the
   * same month is a different risk from five spread across a year, and a
   * column of totals cannot tell the two apart.
   */
  byMonth: number[];
};

export type CategorySpend = {
  category: string;
  amount: number;
  count: number;
  share: number;
  topCounterparties: { name: string; amount: number; count: number }[];
};

export type IncomeBreakdown = {
  /** What the chosen basis produced, per month. */
  perMonth: number;
  /** The total the basis is computed from, after deductions. */
  total: number;
  /**
   * The figure before any deduction — for the default basis this is exactly
   * Safaricom's printed TOTAL · PAID IN, so a reader holding the statement can
   * check the headline against page one without doing any arithmetic of ours.
   */
  grossTotal: number;
  grossPerMonth: number;
  /** Every subtraction between the printed total and the figure used. */
  deductions: { label: string; amount: number; why: string }[];
  basisTitle: string;
  basisDetail: string;
  months: number;
  monthsBasis: "declared" | "observed";
  monthsDetail: string;
  /** The same statement read every other way, so the choice is visible. */
  alternatives: { key: string; title: string; perMonth: number; total: number }[];
};

export type Affordability = {
  method: CrunchPolicy["affordability"]["method"];
  methodTitle: string;
  /** Every line of the arithmetic, in the order it is performed. */
  workings: { step: string; detail: string; value: number | null }[];
  dsrCeiling: number | null;
  surplusCeiling: number | null;
  existingCommitments: number;
  /** The answer. */
  recommendedMaxInstallment: number;
  /** Existing debt service as a share of income, before any new loan. */
  currentDsr: number;
  /** Where DSR would land if the recommended instalment were granted. */
  projectedDsr: number;
  headroomExhausted: boolean;
};

export type ScoreDriver = {
  key: ScoreDriverKey;
  title: string;
  points: number;
  weight: number;
  enabled: boolean;
  detail: string;
  /** −1…1: where this driver sat within its own range, for the bar. */
  fill: number;
};

export type CashflowScore = {
  value: number;
  min: number;
  max: number;
  band: string;
  pd: number;
  drivers: ScoreDriver[];
  base: number;
};

export type Reconciliation = {
  /** Safaricom's printed TOTAL row, when the statement had one. */
  printed: { paidIn: number; paidOut: number } | null;
  /** What our parse totalled. */
  parsed: { paidIn: number; paidOut: number };
  /** Parsed ÷ printed. 1.0 is a complete read. */
  coverageIn: number | null;
  coverageOut: number | null;
  /** Whether Safaricom's own rows sum to Safaricom's own total. */
  summaryFoots: boolean | null;
  note: string;
};

export type BusinessRead = {
  /** True when the statement looks like a trading account rather than a wallet. */
  isTrader: boolean;
  confidence: number;
  signals: string[];
  /** Counterparties that look like stock or supply, not consumption. */
  suppliers: { name: string; amount: number; count: number }[];
  tillReceipts: number;
  tillPayments: number;
};

export type CashflowReport = {
  engineVersion: string;
  generatedAt: string;
  policy: CrunchPolicy;
  summary: StatementSummary;
  reconciliation: Reconciliation;
  period: {
    start: string | null;
    end: string | null;
    label: string | null;
    months: number;
    monthsBasis: "declared" | "observed";
    observedMonths: number;
    txnCount: number;
  };
  income: IncomeBreakdown;
  monthly: MonthPoint[];
  totals: {
    income: number;
    borrowed: number;
    repaid: number;
    spend: number;
    cashOut: number;
    charges: number;
    bankTransfers: number;
    gambling: number;
    saved: number;
    selfTransfers: number;
    unclassifiedCredits: number;
    reversals: number;
  };
  perMonth: {
    income: number;
    spend: number;
    net: number;
    repaid: number;
    charges: number;
    bankTransfers: number;
  };
  volatility: number;
  earningMonthsRatio: number;
  balances: { average: number; minimum: number; closing: number; opening: number; trend: number };
  lenders: LenderPosition[];
  lenderTotals: {
    count: number;
    registered: number;
    unregistered: number;
    borrowed: number;
    repaid: number;
    monthlyCommitment: number;
    dependencyRatio: number;
    fulizaEvents: number;
    byCategory: { category: LenderCategory; count: number; repaid: number }[];
  };
  spendByCategory: CategorySpend[];
  topCounterparties: { name: string; amount: number; count: number; role: FlowRole; lender: boolean }[];
  business: BusinessRead;
  affordability: Affordability;
  score: CashflowScore;
  flags: { tone: "good" | "watch" | "bad"; label: string; detail: string }[];
  narrative: string[];
};

export const ENGINE_VERSION = "interchange-cashflow-v2";

// ── Small helpers ────────────────────────────────────────────────────────────

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Number(n.toFixed(2));
const pct = (n: number) => `${Math.round(n * 100)}%`;
const money = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

function stddev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
}

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m) - 1] ?? m} ${y.slice(2)}`;
}

/** Every YYYY-MM from start to end inclusive, so quiet months still appear. */
function monthRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startIso.slice(0, 7)}-01T00:00:00Z`);
  const last = `${endIso.slice(0, 7)}`;
  for (let i = 0; i < 400; i++) {
    const ym = d.toISOString().slice(0, 7);
    out.push(ym);
    if (ym >= last) break;
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

// ── Life categories for the spend side ───────────────────────────────────────
// Ordered by specificity: the first list whose keyword appears wins, so
// "FAB LIQUOR HOUSE" lands in Alcohol before the generic Retail net.

const TAXONOMY: { cat: string; kw: string[] }[] = [
  { cat: "Betting", kw: ["sportpesa", "betika", "odibets", "1xbet", "mozzart", "betway", "shabiki", "bangbet", "betlion", "mcheza", "kwikbet", "premierbet", "helabet", "melbet", "22bet", "chezacash", "betpawa", "elitebet", "dafabet", "sportybet", "betgr8", "pakakumi", "gamemania", "kessbet", "radabet", "pepeta"] },
  { cat: "Alcohol & nightlife", kw: ["liquor", "liqour", "wines", "spirits", " bar", "bar ", "club", "lounge", " pub", "tavern", "keg", "nightclub", "brew", "distillers", "cellar", "soiree"] },
  { cat: "Fuel & energy", kw: ["petrol", "total energ", "shell", "rubis", "oilibya", "ola energy", "petroleum", "fuel", "gapco", "hashi", "astrol", "m gas", "mgas", "gas limited"] },
  { cat: "Transport", kw: ["sacco", "matatu", "uber", "bolt", "little cab", "taxi", "shuttle", "travellers", "coach", "railway", "sgr", "boda", "logistics", "movers", "transport", "car hire", "fare", "express"] },
  { cat: "Food & dining", kw: ["restaurant", "cafe", "caffe", "coffee", "eatery", "grill", "kitchen", "kfc", "java", "artcaffe", "chicken", "pizza", "burger", "bakery", "fast food", "nyama", "fries", "chips", "canteen", "foods", "deli", "cake", "smocha", "fryz", "samosa"] },
  { cat: "Groceries & household", kw: ["naivas", "quickmart", "quick mart", "carrefour", "tuskys", "chandarana", "cleanshelf", "supermarket", "greengrocer", "grocers", "butchery", "mini mart", "minimart", "minimatt", "wholesalers", "market", "shop", "stores", "purefresh"] },
  { cat: "Health & pharmacy", kw: ["pharmacy", "chemist", "hospital", "clinic", "medical", "healthcare", "afya", "dawa", "dental", "opticians", "diagnostic", "nursing", "wellness", "philmed", "pharmstore", "health services"] },
  { cat: "Education", kw: ["school", "college", "university", "academy", "tuition", "education", "bursary", "polytechnic", "kindergarten", "montessori", "learning", "institute", "helb"] },
  { cat: "Savings & investments", kw: ["money market", "unit trust", "asset manag", "mmf", "cytonn", "nabo", "ziidi", "mali fund", "sacco deposit", "shares"] },
  { cat: "Utilities", kw: ["kplc", "kenya power", "water", "gotv", "dstv", "zuku", "startimes", "electricity", "token", "garbage", "sanitation", "internet", "fibre", "faiba", "safaricom home", "d light", "dlight", "sun king", "solar"] },
  { cat: "Airtime & data", kw: ["airtime", "bundle", "recharge", "safaricom offers", "top up", "topup", "collo connect"] },
  { cat: "Rent & housing", kw: ["rent", "apartments", "properties", "landlord", "housing", "estate", "gardens", "villas", "court "] },
    // NOT "sha " — it matches TAMASHA SHEREHE, which filed a drinks distributor
  // under insurance. Social Health Authority is spelled out instead.
  { cat: "Insurance & pension", kw: ["insurance", "assurance", "nssf", "social health authority", "shif", "nhif", "pension", "afya bora"] },
  { cat: "Government & taxes", kw: ["ntsa", "ecitizen", "e citizen", " kra", "revenue authority", "county", "government", "huduma", "itax", "immigration", "registrar"] },
  { cat: "Retail & services", kw: ["boutique", "collection", "traders", "enterprises", "hardware", "electronics", "phones", "fashion", "clothing", "textiles", "cosmetics", "salon", "barber", "beauty", "furniture", "agrovet", "stationery", "merchants", "distributors"] },
];

function lifeCategory(t: EnrichedTxn): string {
  if (t.isGambling) return "Betting";
  if (t.role === "loan_repayment") return "Loan repayments";
  if (t.role === "saving") return "Savings";
  if (t.role === "bank_transfer") return "Bank and SACCO transfers";
  if (t.role === "charge") return "M-PESA charges";
  if (t.role === "cash_out") return "Cash withdrawals";
  const s = `${t.counterparty.name ?? ""} ${t.details}`.toLowerCase();
  for (const { cat, kw } of TAXONOMY) if (kw.some((k) => s.includes(k))) return cat;
  if (t.counterparty.kind === "person") return "Transfers to people";
  return "Other payments";
}

/**
 * Supplier-shaped spend: the same business, repeatedly, in amounts that look
 * like stock rather than shopping.
 *
 * On one statement read here the single largest outflow was to Philmed HQ, a
 * pharmaceutical wholesaler, against a customer account number. Filed as
 * "where they spend" it is a mystery. Read as stock purchase it says the
 * customer runs a chemist, which changes what their inflows mean and changes
 * which income basis a lender should choose.
 */
const SUPPLIER_WORDS = /\b(WHOLESALE|WHOLESALERS|DISTRIBUTORS?|SUPPLIES|SUPPLIERS?|WAREHOUSE|DEPOT|TRADERS?|IMPORTERS?|MANUFACTURERS?|AGENCIES|STOCKISTS?|HQ|PHARM|MEDICAL SUPP)\b/i;

// ── Enrichment ───────────────────────────────────────────────────────────────

/**
 * Attach a counterparty, a lender identity and a role to every row.
 *
 * The rule that does the most work: a counterparty seen on BOTH sides of the
 * statement with a credit-shaped name is a lender, whatever the row type says.
 * Mular Credit takes 85 payments on paybill 4145907 and sends two disbursements
 * from the same shortcode. That two-way traffic against one account reference
 * is what a credit relationship looks like, and it is not something a keyword
 * list can see.
 */
export function enrich(txns: MpesaTxn[], policy: CrunchPolicy = DEFAULT_POLICY): EnrichedTxn[] {
  const first: { cp: Counterparty; lender: LenderMatch }[] = txns.map((t) => {
    const cp = readCounterparty(t.details);
    let lender = matchLender(cp.name ?? "", cp.code);
    // Safaricom's own credit rows name no counterparty at all: the Fuliza
    // draw-down is just "OverDraft of Credit Party". Without this fallback the
    // largest credit line on most Kenyan statements borrows invisibly — one
    // statement read here showed 1,206 draw-downs against KES 0 borrowed.
    // Only an EXACT registered-name hit is accepted, so a long details string
    // cannot drag in a lender by coincidence.
    if (!isLender(lender) && !cp.name) {
      const viaDetails = matchLender(t.details, null);
      if (viaDetails.method === "registered-name") lender = viaDetails;
    }
    return { cp, lender };
  });

  // Which counterparties moved money in BOTH directions?
  const dirs = new Map<string, Set<"in" | "out">>();
  for (let i = 0; i < txns.length; i++) {
    const key = first[i].cp.code ?? (first[i].cp.name ? `n:${first[i].cp.name!.toLowerCase()}` : null);
    if (!key) continue;
    const s = dirs.get(key) ?? new Set<"in" | "out">();
    s.add(txns[i].direction);
    dirs.set(key, s);
  }

  return txns.map((t, i) => {
    const { cp, lender } = first[i];
    const key = cp.code ?? (cp.name ? `n:${cp.name.toLowerCase()}` : null);
    const bidirectional = key ? (dirs.get(key)?.size ?? 0) > 1 : false;
    const lenderHit = isLender(lender) ? lender : null;
    const { role, reason } = decideRole(t, cp, lenderHit, bidirectional, policy);
    return { ...t, counterparty: cp, lender: lenderHit, role, roleReason: reason };
  });
}

function decideRole(
  t: MpesaTxn,
  cp: Counterparty,
  lender: LenderMatch | null,
  bidirectional: boolean,
  policy: CrunchPolicy,
): { role: FlowRole; reason: string } {
  const d = t.details.toLowerCase();

  // Safaricom's own bookkeeping, both directions.
  if (/\bcharge\b|\bfees?\b/.test(d) && !/recharge/.test(d)) {
    return { role: "charge", reason: "M-PESA transaction fee." };
  }
  if (d.includes("reversal")) {
    return { role: "reversal", reason: "A reversal: money returned." };
  }

  // The Fuliza overdraft. Safaricom books the draw-down as its own row.
  if (d.includes("overdraft of credit party")) {
    return { role: "borrowing", reason: "Fuliza overdraft drawn (Safaricom books the draw-down as its own row)." };
  }
  if (d.includes("od loan repayment") || d.includes("overdraw") || (d.includes("fuliza") && d.includes("repay"))) {
    return { role: "loan_repayment", reason: "Fuliza overdraft repaid." };
  }

  // Savings products.
  if (/\b(m-?shwari|kcb m-?pesa|lock savings|mali|ziidi)\b/.test(d)) {
    if (d.includes("loan") && (d.includes("disburse") || d.includes("received"))) {
      return { role: "borrowing", reason: "Loan disbursed from a mobile savings-and-loan product." };
    }
    if (d.includes("loan") && d.includes("repay")) {
      return { role: "loan_repayment", reason: "Loan repaid to a mobile savings-and-loan product." };
    }
    if (d.includes("deposit") || d.includes("transfer to")) {
      return { role: "saving", reason: "Moved into a savings product." };
    }
    if (d.includes("withdraw")) {
      return { role: "self_transfer", reason: "Withdrawn from the holder's own savings product." };
    }
  }

  if (t.direction === "in") {
    // The holder pulling their own takings out of their own till. Counting it
    // as income would count the sale twice — once when the customer paid the
    // till, once when the holder moved it.
    if (cp.kind === "self") {
      return { role: "self_transfer", reason: "The holder moving money between their own business account and their own wallet." };
    }
    if (lender && lender.category === "fund") {
      return { role: "self_transfer", reason: `Redeemed from ${lender.name}. The holder's own savings coming back, not income and not borrowing.` };
    }
    if (lender) {
      const meaning = lender.entry?.b2c ?? "loan";
      if (meaning === "loan") {
        return { role: "borrowing", reason: `Credit from ${lender.name}, a ${categoryWord(lender.category ?? "dcp")}. ${lender.evidence}` };
      }
      if (meaning === "mixed") {
        // A bank's bulk shortcode carries payroll AND lending. Either guess is
        // a fabrication, so it gets its own bucket unless the member has said
        // their segment is salaried.
        if (policy.income.countBankBulkAsIncome) {
          return { role: "income", reason: `Bulk credit from ${lender.name}; this member's policy counts bank bulk credits as income.` };
        }
        return { role: "unclassified_credit", reason: `Bulk credit from ${lender.name}. A bulk shortcode carries payroll, settlements and loans through one pipe, and the statement does not say which.` };
      }
    }
    if (/agent|deposit/.test(d)) return { role: "income", reason: "Cash deposited at an agent." };
    if (/salary|payroll/.test(d)) return { role: "income", reason: "Salary credit." };
    if (/funds received|received from|receive funds|business payment from|merchant customer payment|receive international/.test(d)) {
      return { role: "income", reason: cp.kind === "person" ? "Received from another M-PESA customer." : "Business payment received." };
    }
    return { role: "unclassified_credit", reason: "A credit the engine could not place with confidence." };
  }

  // ── Outflows ───────────────────────────────────────────────────────────────
  if (lender) {
    if (lender.category === "fund") {
      return { role: "saving", reason: `Paid to ${lender.name}, a fund manager. This is money being put away, not debt being serviced.` };
    }
    if (lender.category === "aggregator") {
      return { role: "spend", reason: `Paid through ${lender.name}, a payment aggregator. The business behind the shortcode is not named on the statement.` };
    }

    // A bank or a SACCO is a lender AND a place people keep money. Their
    // general paybill carries both, so it is only debt service when the row
    // says so. Everything else is a transfer to an account.
    if (lender.category === "bank" || lender.category === "sacco") {
      const saysLoan = /\bloan\b|\brepay|\barrears\b|\binstal/.test(d);
      if (!saysLoan) {
        return {
          role: "bank_transfer",
          reason: `Paid to ${lender.name}${cp.code ? ` on shortcode ${cp.code}` : ""}. A bank's general paybill takes deposits, fees, rent and loan repayments alike, and this row does not say which — so it is counted as money moved to an account, not as a commitment.`,
        };
      }
      return {
        role: "loan_repayment",
        reason: `Paid to ${lender.name}${cp.code ? ` on shortcode ${cp.code}` : ""} and the row names a loan.`,
      };
    }

    // A credit-only provider has one reason to take a payment from a wallet.
    const strong = lender.confidence >= 0.9 || bidirectional || Boolean(cp.accountRef);
    if (strong) {
      return {
        role: "loan_repayment",
        reason: `Paid to ${lender.name}${cp.code ? ` on shortcode ${cp.code}` : ""}${cp.accountRef ? `, account ${cp.accountRef}` : ""}. ${lender.evidence}${bidirectional ? " Money moved in both directions with this counterparty, which is what a credit relationship looks like." : ""}`,
      };
    }
  }
  if (t.isGambling) return { role: "spend", reason: "Payment to a betting operator." };
  if (/withdraw/.test(d)) return { role: "cash_out", reason: "Cash withdrawn at an agent or ATM." };
  if (/airtime|bundle|recharge for customer/.test(d)) return { role: "spend", reason: "Airtime or data." };
  return { role: "spend", reason: cp.kind === "person" ? "Sent to another M-PESA customer." : "Payment to a business." };
}

function categoryWord(c: LenderCategory): string {
  return {
    bank: "CBK-licensed commercial bank",
    mfb: "CBK-licensed microfinance bank",
    dcp: "CBK-licensed digital credit provider",
    sacco: "SASRA-regulated SACCO",
    mfi: "credit-only microfinance institution",
    asset: "asset finance or pay-as-you-go provider",
    mno: "mobile-money credit product",
    aggregator: "payment aggregator",
    fund: "fund manager or collective investment scheme",
  }[c];
}

// ── The analysis ─────────────────────────────────────────────────────────────

export function analyseCashflow(
  txns: MpesaTxn[],
  statementText: string,
  policyIn: CrunchPolicy = DEFAULT_POLICY,
): CashflowReport {
  const policy = policyIn;
  const rows = enrich(txns, policy);
  const summary = readStatementSummary(statementText);

  const observedMonths = new Set(rows.map((t) => t.month)).size || 1;
  const declared = periodMonths(summary, observedMonths);
  const months = policy.income.monthsBasis === "observed_months" ? Math.max(1, observedMonths) : declared.months;
  const monthsBasis: "declared" | "observed" =
    policy.income.monthsBasis === "observed_months" ? "observed" : declared.basis;

  const by = (role: FlowRole) => rows.filter((t) => t.role === role);
  const total = (role: FlowRole) => sum(by(role).map((t) => t.amount));

  const totals = {
    income: r0(total("income")),
    borrowed: r0(total("borrowing")),
    repaid: r0(total("loan_repayment")),
    spend: r0(total("spend")),
    cashOut: r0(total("cash_out")),
    charges: r0(total("charge")),
    bankTransfers: r0(total("bank_transfer")),
    gambling: r0(sum(rows.filter((t) => t.isGambling && t.direction === "out").map((t) => t.amount))),
    saved: r0(total("saving")),
    selfTransfers: r0(sum(rows.filter((t) => t.role === "self_transfer" && t.direction === "in").map((t) => t.amount))),
    unclassifiedCredits: r0(total("unclassified_credit")),
    reversals: r0(sum(rows.filter((t) => t.role === "reversal" && t.direction === "in").map((t) => t.amount))),
  };

  // ── Reconciliation against Safaricom's own totals ──────────────────────────
  const parsedIn = r2(sum(rows.filter((t) => t.direction === "in").map((t) => t.amount)));
  const parsedOut = r2(sum(rows.filter((t) => t.direction === "out").map((t) => t.amount)));
  const printed = summary.printedTotal;
  const reconciliation: Reconciliation = {
    printed,
    parsed: { paidIn: parsedIn, paidOut: parsedOut },
    coverageIn: printed && printed.paidIn > 0 ? r2(parsedIn / printed.paidIn) : null,
    coverageOut: printed && printed.paidOut > 0 ? r2(parsedOut / printed.paidOut) : null,
    summaryFoots: summary.footsExactly,
    note: buildReconNote(printed, parsedIn, parsedOut, summary),
  };

  // ── Income, on the member's chosen basis ───────────────────────────────────
  const receivedMoneyLine = summary.rows.find((r) => r.key === "received_money")?.paidIn ?? 0;
  const statementTotalIn = printed?.paidIn ?? summary.computedTotal?.paidIn ?? parsedIn;

  let deductions = 0;
  if (policy.income.excludeSelfTransfers) deductions += totals.selfTransfers;
  if (policy.income.excludeReversals) deductions += totals.reversals;

  const bases: Record<string, number> = {
    statement_total_in: Math.max(0, statementTotalIn - deductions),
    net_of_borrowing: Math.max(0, statementTotalIn - deductions - totals.borrowed),
    classified_income: totals.income,
    received_money_only: receivedMoneyLine,
  };
  const incomeTotal = bases[policy.income.basis] ?? bases.statement_total_in;

  const deductionLines: IncomeBreakdown["deductions"] = [];
  if (policy.income.excludeSelfTransfers && totals.selfTransfers > 0) {
    deductionLines.push({
      label: "Own-account transfers",
      amount: totals.selfTransfers,
      why: "The holder moving takings from their own business till into this wallet. The sale was already counted when the customer paid the till.",
    });
  }
  if (policy.income.excludeReversals && totals.reversals > 0) {
    deductionLines.push({
      label: "Reversals",
      amount: totals.reversals,
      why: "Money returned because it should not have left. It was never income.",
    });
  }
  if (policy.income.basis === "net_of_borrowing" && totals.borrowed > 0) {
    deductionLines.push({
      label: "Borrowed",
      amount: totals.borrowed,
      why: "Loan draw-downs identified against the CBK and SASRA registers. Money raised, not earned.",
    });
  }
  const grossTotal =
    policy.income.basis === "classified_income" ? totals.income
    : policy.income.basis === "received_money_only" ? receivedMoneyLine
    : statementTotalIn;

  const income: IncomeBreakdown = {
    perMonth: r0(incomeTotal / months),
    total: r0(incomeTotal),
    grossTotal: r0(grossTotal),
    grossPerMonth: r0(grossTotal / months),
    deductions: deductionLines,
    basisTitle: INCOME_BASIS_LABEL[policy.income.basis].title,
    basisDetail: INCOME_BASIS_LABEL[policy.income.basis].detail,
    months,
    monthsBasis,
    monthsDetail:
      monthsBasis === "declared"
        ? `${MONTHS_BASIS_LABEL.declared_period.detail} The statement declares ${summary.header.periodLabel ?? "no period"}.`
        : `${MONTHS_BASIS_LABEL.observed_months.detail} ${observedMonths} month${observedMonths === 1 ? "" : "s"} carry transactions.`,
    alternatives: (Object.keys(bases) as (keyof typeof bases)[])
      .filter((k) => k !== policy.income.basis)
      .map((k) => ({
        key: String(k),
        title: INCOME_BASIS_LABEL[k as keyof typeof INCOME_BASIS_LABEL].title,
        perMonth: r0(bases[k] / months),
        total: r0(bases[k]),
      })),
  };

  // ── The monthly series ─────────────────────────────────────────────────────
  const start = summary.header.periodStart ?? rows[0]?.date ?? null;
  const end = summary.header.periodEnd ?? rows[rows.length - 1]?.date ?? null;
  const keys =
    start && end
      ? monthRange(start, end)
      : [...new Set(rows.map((t) => t.month))].sort();

  const monthly: MonthPoint[] = keys.map((ym) => {
    const inMo = rows.filter((t) => t.month === ym);
    const g = (role: FlowRole) => r0(sum(inMo.filter((t) => t.role === role).map((t) => t.amount)));
    const classifiedIncome = g("income");
    const spend = g("spend");
    const cashOut = g("cash_out");
    const charges = g("charge");
    const bankTransfers = g("bank_transfer");
    const repaid = g("loan_repayment");
    const borrowedMo = g("borrowing");
    const moneyIn = r0(sum(inMo.filter((t) => t.direction === "in").map((t) => t.amount)));
    const moneyOut = r0(sum(inMo.filter((t) => t.direction === "out").map((t) => t.amount)));

    // The same formula the period total uses, applied to one month, so the
    // bars add up to the headline rather than merely resembling it.
    let deduct = 0;
    if (policy.income.excludeSelfTransfers) deduct += r0(sum(inMo.filter((t) => t.role === "self_transfer" && t.direction === "in").map((t) => t.amount)));
    if (policy.income.excludeReversals) deduct += r0(sum(inMo.filter((t) => t.role === "reversal" && t.direction === "in").map((t) => t.amount)));
    const monthIncome =
      policy.income.basis === "classified_income" ? classifiedIncome
      : policy.income.basis === "received_money_only"
        ? r0(sum(inMo.filter((t) => t.role === "income" && t.counterparty.kind === "person").map((t) => t.amount)))
      : policy.income.basis === "net_of_borrowing" ? Math.max(0, moneyIn - deduct - borrowedMo)
      : Math.max(0, moneyIn - deduct);

    return {
      month: ym,
      label: monthLabel(ym),
      income: monthIncome,
      moneyIn,
      moneyOut,
      classifiedIncome,
      borrowed: borrowedMo,
      repaid,
      spend,
      cashOut,
      charges,
      bankTransfers,
      gambling: r0(sum(inMo.filter((t) => t.isGambling && t.direction === "out").map((t) => t.amount))),
      saved: g("saving"),
      net: monthIncome - (spend + cashOut + charges + repaid + (policy.affordability.countBankTransfersAsSpend ? bankTransfers : 0)),
      txns: inMo.length,
      active: inMo.length > 0,
    };
  });

  const monthlyIncomeSeries = monthly.map((m) => m.income);
  const incomeMean = mean(monthlyIncomeSeries);
  const volatility = incomeMean > 0 ? r2(stddev(monthlyIncomeSeries) / incomeMean) : 0;
  const earningMonthsRatio = monthly.length ? r2(monthly.filter((m) => m.income > 0).length / monthly.length) : 0;

  // ── Balances ──────────────────────────────────────────────────────────────
  const bals = rows.map((t) => t.balance).filter((b) => Number.isFinite(b));
  const balances = {
    average: r0(mean(bals)),
    minimum: bals.length ? r0(Math.min(...bals)) : 0,
    opening: r0(bals[0] ?? 0),
    closing: r0(bals[bals.length - 1] ?? 0),
    trend: r0((bals[bals.length - 1] ?? 0) - (bals[0] ?? 0)),
  };

  // ── Lender positions ──────────────────────────────────────────────────────
  const lenders = buildLenderPositions(rows, months, monthly.map((m) => m.month));
  // ONLY the draw-down rows. Safaricom writes "with Fuliza M-Pesa" onto every
  // purchase the overdraft funded, so matching the word counts one borrowing
  // three times — it reported 2,840 events on a statement that has 428.
  const fulizaEvents = rows.filter((t) => /overdraft of credit party/i.test(t.details)).length;
  const lenderTotals = {
    count: lenders.length,
    registered: lenders.filter((l) => !l.unregistered).length,
    unregistered: lenders.filter((l) => l.unregistered).length,
    borrowed: r0(sum(lenders.map((l) => l.borrowed))),
    repaid: r0(sum(lenders.map((l) => l.repaid))),
    monthlyCommitment: r0(sum(lenders.map((l) => l.monthlyCommitment))),
    dependencyRatio:
      incomeTotal + totals.borrowed > 0 ? r2(totals.borrowed / (incomeTotal + totals.borrowed)) : 0,
    fulizaEvents,
    byCategory: [...new Map(
      lenders.map((l) => [l.category, { category: l.category, count: 0, repaid: 0 }]),
    ).values()].map((row) => {
      const hits = lenders.filter((l) => l.category === row.category);
      return { category: row.category, count: hits.length, repaid: r0(sum(hits.map((h) => h.repaid))) };
    }).sort((a, b) => b.repaid - a.repaid),
  };

  // ── Spend ─────────────────────────────────────────────────────────────────
  const outRows = rows.filter((t) => t.direction === "out");
  const grossOut = sum(outRows.map((t) => t.amount)) || 1;
  const catMap = new Map<string, { amount: number; count: number; parties: Map<string, { amount: number; count: number }> }>();
  for (const t of outRows) {
    const cat = lifeCategory(t);
    const c = catMap.get(cat) ?? { amount: 0, count: 0, parties: new Map() };
    c.amount += t.amount;
    c.count += 1;
    const pname = t.lender?.name ?? t.counterparty.name ?? "Unnamed counterparty";
    const p = c.parties.get(pname) ?? { amount: 0, count: 0 };
    p.amount += t.amount; p.count += 1;
    c.parties.set(pname, p);
    catMap.set(cat, c);
  }
  const spendByCategory: CategorySpend[] = [...catMap.entries()]
    .map(([category, v]) => ({
      category,
      amount: r0(v.amount),
      count: v.count,
      share: r2(v.amount / grossOut),
      topCounterparties: [...v.parties.entries()]
        .map(([name, p]) => ({ name, amount: r0(p.amount), count: p.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    }))
    .sort((a, b) => b.amount - a.amount);

  const partyMap = new Map<string, { amount: number; count: number; role: FlowRole; lender: boolean }>();
  for (const t of outRows) {
    const name = t.lender?.name ?? t.counterparty.name ?? "Unnamed counterparty";
    const p = partyMap.get(name) ?? { amount: 0, count: 0, role: t.role, lender: Boolean(t.lender) };
    p.amount += t.amount; p.count += 1;
    if (t.lender) p.lender = true;
    partyMap.set(name, p);
  }
  const topCounterparties = [...partyMap.entries()]
    .map(([name, p]) => ({ name, amount: r0(p.amount), count: p.count, role: p.role, lender: p.lender }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15);

  // ── Is this a trading account? ────────────────────────────────────────────
  const business = readBusiness(rows, topCounterparties, grossOut);

  // ── Affordability and score ───────────────────────────────────────────────
  const bankedAsSpend = policy.affordability.countBankTransfersAsSpend ? totals.bankTransfers : 0;
  const perMonth = {
    income: income.perMonth,
    spend: r0((totals.spend + totals.cashOut + totals.charges + bankedAsSpend) / months),
    net: r0((incomeTotal - totals.spend - totals.cashOut - totals.charges - bankedAsSpend - totals.repaid) / months),
    repaid: r0(totals.repaid / months),
    charges: r0(totals.charges / months),
    bankTransfers: r0(totals.bankTransfers / months),
  };

  const affordability = assessAffordability(policy, income.perMonth, perMonth, lenderTotals.monthlyCommitment);
  const score = scoreStatement(policy, {
    incomePerMonth: income.perMonth,
    volatility,
    earningMonthsRatio,
    netPerMonth: perMonth.net,
    dependencyRatio: lenderTotals.dependencyRatio,
    borrowed: totals.borrowed,
    repaid: totals.repaid,
    gamblingShare: grossOut > 0 ? totals.gambling / grossOut : 0,
    gambling: totals.gambling,
    saved: totals.saved,
    fulizaEvents,
    lenderCount: lenders.length,
    unregisteredCount: lenderTotals.unregistered,
    avgBalance: balances.average,
    monthlySpend: perMonth.spend,
    months,
  });

  const flags = buildFlags(policy, { totals, lenderTotals, lenders, income, perMonth, volatility, business, reconciliation, grossOut, fulizaEvents });
  const narrative = buildNarrative({ summary, income, perMonth, lenders, lenderTotals, business, totals, grossOut, affordability, score, months });

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    policy,
    summary,
    reconciliation,
    period: {
      start: summary.header.periodStart ?? rows[0]?.date ?? null,
      end: summary.header.periodEnd ?? rows[rows.length - 1]?.date ?? null,
      label: summary.header.periodLabel,
      months,
      monthsBasis,
      observedMonths,
      txnCount: rows.length,
    },
    income,
    monthly,
    totals,
    perMonth,
    volatility,
    earningMonthsRatio,
    balances,
    lenders,
    lenderTotals,
    spendByCategory,
    topCounterparties,
    business,
    affordability,
    score,
    flags,
    narrative,
  };
}

function buildReconNote(
  printed: { paidIn: number; paidOut: number } | null,
  parsedIn: number,
  parsedOut: number,
  summary: StatementSummary,
): string {
  if (!printed) return "This statement carried no summary block, so the figures below are our parse alone.";
  const ci = printed.paidIn > 0 ? parsedIn / printed.paidIn : 1;
  const co = printed.paidOut > 0 ? parsedOut / printed.paidOut : 1;
  const parts: string[] = [];
  parts.push(
    `Our parse reads ${pct(ci)} of the paid-in total and ${pct(co)} of the paid-out total that Safaricom printed on page one.`,
  );
  if (summary.footsExactly === false && summary.computedTotal) {
    parts.push(
      `Safaricom's own summary does not foot: its rows sum to ${money(summary.computedTotal.paidIn)} in and ${money(summary.computedTotal.paidOut)} out, against a printed total of ${money(printed.paidIn)} and ${money(printed.paidOut)}. Both figures are reproduced as printed; neither has been corrected here.`,
    );
  }
  return parts.join(" ");
}

function buildLenderPositions(rows: EnrichedTxn[], months: number, monthKeys: string[]): LenderPosition[] {
  type Acc = {
    name: string; category: LenderCategory; regulator: string; register: string;
    unregistered: boolean; confidence: number; method: LenderMatch["method"]; evidence: string;
    codes: Set<string>; refs: Set<string>; borrowed: number; repaid: number; events: number;
    dates: string[]; months: Set<string>; dirs: Set<"in" | "out">; byMonth: Map<string, number>;
  };
  const map = new Map<string, Acc>();

  for (const t of rows) {
    if (!t.lender) continue;
    if (t.role !== "loan_repayment" && t.role !== "borrowing") continue;
    // Key on the normalised core, not the raw name: "NABO CAPITAL LTD" and
    // "NABO CAPITAL LTD C2B" are one counterparty wearing two suffixes, and
    // keying on the name listed them as two separate lenders.
    const key = t.lender.entry?.key ?? `x:${coreName(t.lender.name) || t.lender.name.toLowerCase()}`;
    // Annotated, not inferred: without it the fallback literal's empty Set and
    // Map widen to Set<never>/Map<never, never> and every .add() below fails.
    const a: Acc = map.get(key) ?? {
      name: t.lender.name,
      category: t.lender.category ?? "dcp",
      regulator: t.lender.entry?.regulator ?? "none",
      register: t.lender.entry?.register ?? "not on any register held here",
      unregistered: t.lender.unregistered,
      confidence: t.lender.confidence,
      method: t.lender.method,
      evidence: t.lender.evidence,
      codes: new Set<string>(), refs: new Set<string>(),
      borrowed: 0, repaid: 0, events: 0, dates: [], months: new Set(), dirs: new Set(), byMonth: new Map(),
    };
    if (t.counterparty.code) a.codes.add(t.counterparty.code);
    if (t.counterparty.accountRef) a.refs.add(t.counterparty.accountRef);
    if (t.role === "borrowing") a.borrowed += t.amount;
    if (t.role === "loan_repayment") {
      a.repaid += t.amount;
      a.byMonth.set(t.month, (a.byMonth.get(t.month) ?? 0) + t.amount);
    }
    a.events += 1;
    a.dates.push(t.date);
    a.months.add(t.month);
    a.dirs.add(t.direction);
    // Keep the strongest identification seen for this lender.
    if (t.lender.confidence > a.confidence) {
      a.confidence = t.lender.confidence;
      a.method = t.lender.method;
      a.evidence = t.lender.evidence;
    }
    map.set(key, a);
  }

  return [...map.entries()]
    .map(([key, a]) => {
      const ds = [...new Set(a.dates)].sort();
      const gaps: number[] = [];
      for (let i = 1; i < ds.length; i++) {
        gaps.push((new Date(ds[i]).getTime() - new Date(ds[i - 1]).getTime()) / 86_400_000);
      }
      return {
        key,
        name: a.name,
        category: a.category,
        regulator: a.regulator,
        register: a.register,
        unregistered: a.unregistered,
        confidence: a.confidence,
        method: a.method,
        evidence: a.evidence,
        codes: [...a.codes],
        accountRefs: [...a.refs].slice(0, 6),
        borrowed: r0(a.borrowed),
        repaid: r0(a.repaid),
        events: a.events,
        firstSeen: ds[0] ?? null,
        lastSeen: ds[ds.length - 1] ?? null,
        monthlyCommitment: r0(a.repaid / months),
        monthsActive: a.months.size,
        cadenceDays: gaps.length ? Math.round(median(gaps.filter((g) => g > 0))) || null : null,
        bidirectional: a.dirs.size > 1,
        byMonth: monthKeys.map((k) => r0(a.byMonth.get(k) ?? 0)),
      };
    })
    .sort((a, b) => b.repaid + b.borrowed - (a.repaid + a.borrowed));
}

function readBusiness(
  rows: EnrichedTxn[],
  topCounterparties: { name: string; amount: number; count: number }[],
  grossOut: number,
): BusinessRead {
  const signals: string[] = [];
  const suppliers = topCounterparties
    .filter((p) => SUPPLIER_WORDS.test(p.name) && p.count >= 3)
    .slice(0, 6);

  const tillReceipts = rows.filter((t) => t.direction === "in" && /merchant customer payment|business payment from|till/i.test(t.details)).length;
  const selfWithdrawals = rows.filter((t) => t.role === "self_transfer" && /small business|business account/i.test(t.details)).length;
  const supplierSpend = sum(suppliers.map((s) => s.amount));

  let confidence = 0;
  if (suppliers.length) {
    confidence += Math.min(0.4, supplierSpend / grossOut * 2);
    signals.push(`${suppliers.length} wholesale or supply counterpart${suppliers.length === 1 ? "y" : "ies"} taking ${money(supplierSpend)}, ${pct(supplierSpend / grossOut)} of all money out.`);
  }
  if (selfWithdrawals >= 5) {
    confidence += 0.3;
    signals.push(`${selfWithdrawals} transfers from a business till into this wallet — the holder banking their own takings.`);
  }
  if (tillReceipts >= 20) {
    confidence += 0.2;
    signals.push(`${tillReceipts} inbound merchant or business payments, which is a counter taking money rather than a wallet receiving it.`);
  }
  const manyPeople = rows.filter((t) => t.direction === "in" && t.counterparty.kind === "person").length;
  if (manyPeople >= 100) {
    confidence += 0.2;
    signals.push(`${manyPeople} separate person-to-person receipts — a pattern of many small customers rather than one employer.`);
  }

  confidence = Math.min(1, Number(confidence.toFixed(2)));
  return {
    isTrader: confidence >= 0.45,
    confidence,
    signals,
    suppliers: suppliers.map((s) => ({ name: s.name, amount: s.amount, count: s.count })),
    tillReceipts,
    tillPayments: rows.filter((t) => t.direction === "out" && t.counterparty.code && t.counterparty.accountRef).length,
  };
}

// ── Affordability ────────────────────────────────────────────────────────────

function assessAffordability(
  policy: CrunchPolicy,
  incomePerMonth: number,
  perMonth: { spend: number; net: number; repaid: number },
  existingCommitments: number,
): Affordability {
  const a = policy.affordability;
  const workings: Affordability["workings"] = [];

  workings.push({ step: "Monthly income", detail: `${INCOME_BASIS_LABEL[policy.income.basis].title}, over ${MONTHS_BASIS_LABEL[policy.income.monthsBasis].title.toLowerCase()}.`, value: incomePerMonth });

  // Route 1 — debt service ratio.
  const dsrGross = incomePerMonth * a.dsrCap;
  const dsrNet = a.deductExistingCommitments ? dsrGross - existingCommitments : dsrGross;
  workings.push({ step: `Debt service cap at ${Math.round(a.dsrCap * 100)}%`, detail: `${Math.round(a.dsrCap * 100)}% of monthly income is the most this member will see going to debt.`, value: r0(dsrGross) });
  if (a.deductExistingCommitments) {
    workings.push({ step: "Less existing commitments", detail: `Instalments already going to other credit providers, read from this statement.`, value: -r0(existingCommitments) });
  }
  const dsrCeiling = Math.max(0, r0(dsrNet));

  // Route 2 — share of surplus.
  workings.push({ step: "Monthly surplus", detail: "Income less spending, cash out, M-PESA charges and existing debt service.", value: perMonth.net });
  const surplusCeiling = Math.max(0, r0(perMonth.net * a.surplusShare));
  workings.push({ step: `Share of surplus at ${Math.round(a.surplusShare * 100)}%`, detail: "The part of what is actually left over that a new instalment may take.", value: surplusCeiling });

  let raw: number;
  if (a.method === "dsr_on_income") raw = dsrCeiling;
  else if (a.method === "share_of_surplus") raw = surplusCeiling;
  else raw = Math.min(dsrCeiling, surplusCeiling);
  workings.push({ step: METHOD_LABEL[a.method].title, detail: METHOD_LABEL[a.method].detail, value: raw });

  if (a.ceilingKes > 0 && raw > a.ceilingKes) {
    raw = a.ceilingKes;
    workings.push({ step: "Member ceiling applied", detail: `This member caps any single instalment at ${money(a.ceilingKes)}.`, value: raw });
  }
  const rounded = a.roundToKes > 1 ? Math.floor(raw / a.roundToKes) * a.roundToKes : Math.floor(raw);
  const final = rounded < a.floorKes ? 0 : rounded;
  workings.push({
    step: final === 0 ? "Below the member's floor" : "Rounded to the member's step",
    detail: final === 0
      ? `Anything under ${money(a.floorKes)} is reported as nothing rather than as a small number, because a loan that size is not worth writing.`
      : `Rounded down to the nearest ${money(a.roundToKes)}.`,
    value: final,
  });

  const currentDsr = incomePerMonth > 0 ? r2(existingCommitments / incomePerMonth) : 0;
  const projectedDsr = incomePerMonth > 0 ? r2((existingCommitments + final) / incomePerMonth) : 0;

  return {
    method: a.method,
    methodTitle: METHOD_LABEL[a.method].title,
    workings,
    dsrCeiling,
    surplusCeiling,
    existingCommitments: r0(existingCommitments),
    recommendedMaxInstallment: final,
    currentDsr,
    projectedDsr,
    headroomExhausted: final === 0,
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

type ScoreInput = {
  incomePerMonth: number; volatility: number; earningMonthsRatio: number; netPerMonth: number;
  dependencyRatio: number; borrowed: number; repaid: number; gamblingShare: number; gambling: number;
  saved: number; fulizaEvents: number; lenderCount: number; unregisteredCount: number;
  avgBalance: number; monthlySpend: number; months: number;
};

/**
 * Turn the statement into a number, with every driver showing its own weight.
 *
 * `fill` is where the driver landed inside its own range, −1 to 1. The report
 * draws it as a bar, so a lender can see not only that loan dependency cost 78
 * points but that it was near the bottom of what that driver can cost.
 */
function scoreStatement(policy: CrunchPolicy, x: ScoreInput): CashflowScore {
  const s = policy.score;
  const th = policy.thresholds;
  const drivers: ScoreDriver[] = [];
  let value = s.base;

  const push = (key: ScoreDriverKey, fill: number, detail: string) => {
    const cfg = s.drivers[key];
    const meta = DRIVER_LABEL[key];
    if (!cfg.enabled) {
      drivers.push({ key, title: meta.title, points: 0, weight: cfg.weight, enabled: false, detail: `${detail} Not scored: this member has the driver switched off.`, fill: 0 });
      return;
    }
    const clamped = Math.max(-1, Math.min(1, fill));
    const points = Math.round(clamped * cfg.weight);
    value += points;
    drivers.push({ key, title: meta.title, points, weight: cfg.weight, enabled: true, detail, fill: clamped });
  };

  // Income level — a log curve, because the step from 20k to 40k matters far
  // more than the step from 200k to 220k.
  const lvl = x.incomePerMonth > 0 ? Math.log10(x.incomePerMonth / 15_000) / Math.log10(8) : -1;
  push("incomeLevel", lvl, `Average income ${money(x.incomePerMonth)}/mo on the chosen basis.`);

  // Stability.
  const stab = x.volatility <= th.volatilityStable
    ? 1 - x.volatility / th.volatilityStable
    : -Math.min(1, (x.volatility - th.volatilityStable) / Math.max(0.01, th.volatilityErratic - th.volatilityStable));
  push("incomeStability", stab, `Income volatility ${x.volatility} (stable below ${th.volatilityStable}, erratic above ${th.volatilityErratic}).`);

  push("earningConsistency", x.earningMonthsRatio * 2 - 1, `Money came in during ${pct(x.earningMonthsRatio)} of the ${x.months} months in the period.`);

  const disp = x.incomePerMonth > 0 ? Math.max(-1, Math.min(1, (x.netPerMonth / x.incomePerMonth) * 4)) : -1;
  push("disposableIncome", disp, x.netPerMonth >= 0
    ? `Keeps ${money(x.netPerMonth)}/mo after spending and existing debt service.`
    : `Spends ${money(Math.abs(x.netPerMonth))}/mo more than comes in, before any new instalment.`);

  const dep = x.dependencyRatio <= th.loanDependencyWatch
    ? 0
    : -Math.min(1, (x.dependencyRatio - th.loanDependencyWatch) / (1 - th.loanDependencyWatch));
  push("loanDependency", dep, `${pct(x.dependencyRatio)} of money in was borrowed rather than earned (${money(x.borrowed)}).`);

  const repayRatio = x.borrowed > 0 ? x.repaid / x.borrowed : 1;
  push("loanRepayment", Math.max(-1, Math.min(1, (repayRatio - 0.85) * 4)), x.borrowed > 0
    ? `Repaid ${money(x.repaid)} against ${money(x.borrowed)} borrowed — ${pct(repayRatio)}.`
    : "No borrowing seen on this statement.");

  const gam = x.gamblingShare <= th.gamblingWatch ? 0 : -Math.min(1, (x.gamblingShare - th.gamblingWatch) / 0.15);
  push("gambling", gam, x.gambling > 0
    ? `${money(x.gambling)} to betting operators, ${pct(x.gamblingShare)} of all money out.`
    : "No payments to betting operators found.");

  const saveShare = x.incomePerMonth > 0 ? x.saved / x.months / x.incomePerMonth : 0;
  push("savings", Math.min(1, saveShare * 10), x.saved > 0
    ? `${money(x.saved)} moved into savings over the period.`
    : "No transfers into a savings product.");

  const ful = x.fulizaEvents <= th.fulizaEvents ? 0 : -Math.min(1, (x.fulizaEvents - th.fulizaEvents) / 200);
  push("fulizaReliance", ful, `${x.fulizaEvents} Fuliza overdraft events across the period.`);

  const lc = x.lenderCount <= th.lenderCountWatch ? 0 : -Math.min(1, (x.lenderCount - th.lenderCountWatch) / 6);
  push("lenderCount", lc, `${x.lenderCount} separate credit provider${x.lenderCount === 1 ? "" : "s"} identified on this statement.`);

  push("unregisteredLenders", x.unregisteredCount === 0 ? 0 : -Math.min(1, x.unregisteredCount / 3), x.unregisteredCount > 0
    ? `${x.unregisteredCount} counterpart${x.unregisteredCount === 1 ? "y appears" : "ies appear"} to be a credit provider but sit on no CBK or SASRA register held here.`
    : "Every credit provider identified is on a CBK or SASRA register.");

  const cushion = x.monthlySpend > 0 ? Math.min(1, x.avgBalance / (x.monthlySpend * 0.5)) - 0.2 : 0;
  push("balanceCushion", cushion, `Average balance ${money(x.avgBalance)} against ${money(x.monthlySpend)}/mo of spending.`);

  value = Math.max(s.min, Math.min(s.max, Math.round(value)));
  const band = s.bands.find((b) => value >= b.min) ?? s.bands[s.bands.length - 1];

  return { value, min: s.min, max: s.max, band: band.label, pd: band.pd, drivers, base: s.base };
}

// ── Flags and narrative ──────────────────────────────────────────────────────

function buildFlags(
  policy: CrunchPolicy,
  x: {
    totals: CashflowReport["totals"]; lenderTotals: CashflowReport["lenderTotals"];
    lenders: LenderPosition[]; income: IncomeBreakdown; perMonth: CashflowReport["perMonth"];
    volatility: number; business: BusinessRead; reconciliation: Reconciliation;
    grossOut: number; fulizaEvents: number;
  },
): CashflowReport["flags"] {
  const f: CashflowReport["flags"] = [];
  const th = policy.thresholds;

  if (x.perMonth.net > 0) f.push({ tone: "good", label: "Positive monthly surplus", detail: `Keeps ${money(x.perMonth.net)} a month after everything already committed.` });
  else f.push({ tone: "bad", label: "No monthly surplus", detail: `Spending and existing debt service exceed income by ${money(Math.abs(x.perMonth.net))} a month.` });

  if (x.lenderTotals.count > 0) {
    f.push({
      tone: x.lenderTotals.count > th.lenderCountWatch ? "bad" : "watch",
      label: `${x.lenderTotals.count} credit provider${x.lenderTotals.count === 1 ? "" : "s"} already being serviced`,
      detail: `${money(x.lenderTotals.monthlyCommitment)} a month, ${x.lenderTotals.registered} on a CBK or SASRA register${x.lenderTotals.unregistered ? `, ${x.lenderTotals.unregistered} on none held here` : ""}.`,
    });
  }
  if (x.lenderTotals.unregistered > 0) {
    f.push({
      tone: "bad",
      label: `${x.lenderTotals.unregistered} unregistered credit provider${x.lenderTotals.unregistered === 1 ? "" : "s"}`,
      detail: x.lenders.filter((l) => l.unregistered).map((l) => l.name).join(", ") + ". A borrower servicing an unlicensed lender carries a risk no bureau records.",
    });
  }
  const gShare = x.grossOut > 0 ? x.totals.gambling / x.grossOut : 0;
  if (gShare > th.gamblingWatch) {
    f.push({ tone: gShare > 0.08 ? "bad" : "watch", label: "Betting activity", detail: `${money(x.totals.gambling)} to betting operators, ${pct(gShare)} of all money out.` });
  }
  if (x.lenderTotals.dependencyRatio > th.loanDependencyWatch) {
    f.push({ tone: "bad", label: "Borrowing funds the wallet", detail: `${pct(x.lenderTotals.dependencyRatio)} of money in was borrowed.` });
  }
  if (x.fulizaEvents > th.fulizaEvents * 10) {
    f.push({ tone: "bad", label: "Runs on Fuliza", detail: `${x.fulizaEvents} overdraft events. The wallet reaches zero and keeps transacting.` });
  }
  if (x.volatility > th.volatilityErratic) {
    f.push({ tone: "watch", label: "Erratic income", detail: `Month-to-month income swings by a coefficient of ${x.volatility}.` });
  }
  if (x.business.isTrader) {
    f.push({ tone: "good", label: "Trading account", detail: `This reads as a business wallet, not a salary wallet. ${x.business.signals[0] ?? ""}` });
  }
  const offRail = x.lenders.filter((l) => l.borrowed > 0 && l.repaid < l.borrowed * 0.25);
  if (offRail.length) {
    f.push({
      tone: "watch",
      label: "Debt serviced off this rail",
      detail: `${offRail.map((l) => `${l.name} advanced ${money(l.borrowed)} and only ${money(l.repaid)} of repayment is visible here`).join("; ")}. The instalments are being paid somewhere M-PESA does not see, so the commitment below is understated.`,
    });
  }
  if (x.totals.unclassifiedCredits > 0) {
    f.push({
      tone: "watch",
      label: "Credits the engine would not guess at",
      detail: `${money(x.totals.unclassifiedCredits)} arrived through channels that carry payroll, settlements and loans alike. Neither counted as income nor as borrowing.`,
    });
  }
  if (x.reconciliation.coverageIn !== null && x.reconciliation.coverageIn < 0.95) {
    f.push({ tone: "watch", label: "Partial read", detail: `Our parse covers ${pct(x.reconciliation.coverageIn)} of the paid-in total Safaricom printed. Figures below are on what was read.` });
  }
  return f;
}

function buildNarrative(x: {
  summary: StatementSummary; income: IncomeBreakdown; perMonth: CashflowReport["perMonth"];
  lenders: LenderPosition[]; lenderTotals: CashflowReport["lenderTotals"]; business: BusinessRead;
  totals: CashflowReport["totals"]; grossOut: number; affordability: Affordability;
  score: CashflowScore; months: number;
}): string[] {
  const out: string[] = [];
  const name = x.summary.header.customerName ?? "This customer";

  out.push(
    `Over ${x.months} month${x.months === 1 ? "" : "s"}, ${money(x.income.total)} passed into this wallet — ${money(x.income.perMonth)} a month on the ${x.income.basisTitle.toLowerCase()} basis — against ${money(x.perMonth.spend)} a month of spending, cash withdrawals and charges.`,
  );

  if (x.business.isTrader) {
    out.push(
      `${name} is trading, not drawing a salary. ${x.business.signals.join(" ")} That matters for which income basis this member should choose: gross turnover flatters a trader's capacity, because most of what comes in goes straight back out as stock.`,
    );
  }

  if (x.lenders.length) {
    const top = x.lenders.slice(0, 3);
    out.push(
      `${x.lenders.length} credit provider${x.lenders.length === 1 ? "" : "s"} appear on this statement, taking ${money(x.lenderTotals.monthlyCommitment)} a month between them. The largest ${top.length === 1 ? "is" : "are"} ${top.map((l) => `${l.name} (${money(l.monthlyCommitment)}/mo${l.accountRefs.length ? `, account ${l.accountRefs[0]}` : ""})`).join(", ")}.`,
    );
    const unreg = x.lenders.filter((l) => l.unregistered);
    if (unreg.length) {
      out.push(
        `${unreg.map((l) => l.name).join(", ")} ${unreg.length === 1 ? "is" : "are"} not on any CBK or SASRA register held here. The name is unmistakably a credit business, so the payments are counted as debt service, and the absence from the register is reported rather than smoothed over.`,
      );
    }
  } else {
    out.push("No credit provider appears on this statement. That is unusual enough to be worth a second look: it may mean no borrowing, or it may mean the borrowing happens off the M-PESA rail.");
  }

  if (x.totals.gambling > 0) {
    out.push(`${money(x.totals.gambling)} went to betting operators, ${pct(x.totals.gambling / x.grossOut)} of everything that left the wallet.`);
  }

  out.push(
    x.affordability.recommendedMaxInstallment > 0
      ? `On this member's settings the statement supports a new instalment of ${money(x.affordability.recommendedMaxInstallment)} a month, which would take total debt service from ${pct(x.affordability.currentDsr)} of income to ${pct(x.affordability.projectedDsr)}.`
      : `On this member's settings the statement supports no new instalment. Existing debt service is already ${pct(x.affordability.currentDsr)} of income and the surplus does not cover another commitment.`,
  );

  return out;
}
