// ─────────────────────────────────────────────────────────────────────────────
// THE CRUNCH POLICY — every judgement in the affordability report, as settings.
//
// ── WHY THE NUMBERS ARE NOT IN THE CODE ──────────────────────────────────────
// "Average monthly income" is not a fact. It is a choice between at least four
// defensible definitions, and the choice moves the answer by a factor of two:
//
//   gross credit turnover      KES 114,172/mo   (everything that came in)
//   less borrowing             KES  96,410/mo   (turnover minus loan draw-downs)
//   classified income only     KES  60,612/mo   (rows our classifier calls income)
//   received money only        KES  57,587/mo   (Safaricom's RECEIVED MONEY line)
//
// A microfinance lender writing 30-day working-capital loans to traders wants
// the first. A salary-advance lender wants the third. Both are right for their
// book, and neither should have to accept the other's definition because it was
// hard-coded by whoever wrote the cruncher first.
//
// The same is true of the instalment ceiling. "A third of surplus" and "35% of
// income less existing commitments" are both standard; they disagree; and the
// lender carrying the loss is the one entitled to decide.
//
// So all of it lives here, every member gets their own copy, and the report
// PRINTS THE SETTINGS IT USED. Two members crunching the same statement should
// get different answers, and should each be able to see exactly why.
//
// ── WHAT IS NOT CONFIGURABLE ─────────────────────────────────────────────────
// The facts. What the statement says, what the summary table totals, which
// counterparties are on the CBK register, how many months the period covers.
// A member configures how to READ the evidence, never what the evidence is.
// ─────────────────────────────────────────────────────────────────────────────

/** How "money in" becomes "income". */
export type IncomeBasis =
  /**
   * Everything credited to the wallet, as Safaricom's own summary totals it.
   * The declared default: it is the only figure on the statement the operator
   * themselves vouches for, and for a trader it is the closest thing to
   * turnover. It includes borrowing, which is why the report always shows the
   * borrowed share beside it.
   */
  | "statement_total_in"
  /** Statement total in, less every credit identified as a loan draw-down. */
  | "net_of_borrowing"
  /** Only rows the classifier calls income: salary, business receipts, deposits. */
  | "classified_income"
  /** Safaricom's RECEIVED MONEY line alone — person-to-person receipts. */
  | "received_money_only";

/** What to divide by. */
export type MonthsBasis = "declared_period" | "observed_months";

/** How the comfortable instalment is derived. */
export type AffordabilityMethod =
  /** A capped share of income, less what is already committed elsewhere. */
  | "dsr_on_income"
  /** A share of what is actually left over each month. */
  | "share_of_surplus"
  /** The lower of the two. The conservative reading, and the default. */
  | "lower_of_both";

export type ScoreDriverKey =
  | "incomeLevel"
  | "incomeStability"
  | "earningConsistency"
  | "disposableIncome"
  | "loanDependency"
  | "loanRepayment"
  | "gambling"
  | "savings"
  | "fulizaReliance"
  | "lenderCount"
  | "unregisteredLenders"
  | "balanceCushion";

export type DriverSetting = {
  /** Off entirely when false. The driver still prints, marked "not scored". */
  enabled: boolean;
  /**
   * The most this driver may move the score, in points. Signed drivers use
   * this as the magnitude of the swing in either direction.
   */
  weight: number;
};

export type CrunchPolicy = {
  version: string;
  /** Which member this belongs to. "default" is the Interchange's own. */
  memberCode: string;
  label: string;
  updatedAt: string;
  updatedBy: string | null;

  income: {
    basis: IncomeBasis;
    monthsBasis: MonthsBasis;
    /**
     * Drop the holder moving money between their own till and their own
     * wallet. On a trader's statement these are the largest credits on the
     * page and none of them is income — the sale was already counted when the
     * customer paid the till.
     */
    excludeSelfTransfers: boolean;
    /** Drop reversals: money that came back because it should not have left. */
    excludeReversals: boolean;
    /**
     * Treat credits from a bank's bulk-payment shortcode as income.
     *
     * False by default. "Equity Bulk Account" carries payroll, supplier
     * settlement, insurance claims and loans through one pipe; the statement
     * does not say which, and the report gives them their own line rather than
     * assuming. A lender who knows their segment is salaried can turn it on.
     */
    countBankBulkAsIncome: boolean;
  };

  affordability: {
    method: AffordabilityMethod;
    /** Ceiling on total debt service as a share of income. Market norm 0.30–0.50. */
    dsrCap: number;
    /** Share of monthly surplus a new instalment may take. */
    surplusShare: number;
    /**
     * Subtract instalments already going to other lenders from the headroom.
     * Off means the ceiling is gross and the officer nets it themselves.
     */
    deductExistingCommitments: boolean;
    /** Below this the answer is "nothing", not a small number. */
    floorKes: number;
    /** Hard cap regardless of the arithmetic. 0 = no cap. */
    ceilingKes: number;
    /** Round down to this step, so the figure reads like a product. */
    roundToKes: number;
    /**
     * Count money sent to a bank's or SACCO's general paybill as spending.
     *
     * Off by default. Banking your takings is not consuming them — the money
     * is still the customer's and is still available to service a loan. A
     * lender who would rather treat anything that leaves the wallet as gone
     * turns this on, and the surplus falls accordingly.
     */
    countBankTransfersAsSpend: boolean;
  };

  score: {
    /** Where a statement with no signal at all starts. */
    base: number;
    min: number;
    max: number;
    drivers: Record<ScoreDriverKey, DriverSetting>;
    /** Descending. The first band whose `min` the score reaches wins. */
    bands: { min: number; label: string; pd: number }[];
  };

  thresholds: {
    /** Betting share of outflow above which the driver bites. */
    gamblingWatch: number;
    /** Borrowed share of inflow above which loan dependency bites. */
    loanDependencyWatch: number;
    /** Fuliza events in the period above which reliance is flagged. */
    fulizaEvents: number;
    /** Income volatility (coefficient of variation) considered stable / erratic. */
    volatilityStable: number;
    volatilityErratic: number;
    /** Lenders beyond this count start costing points. */
    lenderCountWatch: number;
  };
};

/**
 * The Interchange's own reading, and what a new member starts from.
 *
 * `statement_total_in` and `declared_period` are the founder's instruction and
 * they are also the defensible pair: both come from the operator's own printed
 * figures rather than from our classifier, so the headline number on page one
 * can be checked against the statement by anybody holding both.
 */
export const DEFAULT_POLICY: CrunchPolicy = {
  version: "crunch-policy-v1",
  memberCode: "default",
  label: "Interchange default",
  updatedAt: "2026-09-18",
  updatedBy: null,

  income: {
    basis: "statement_total_in",
    monthsBasis: "declared_period",
    excludeSelfTransfers: true,
    excludeReversals: true,
    countBankBulkAsIncome: false,
  },

  affordability: {
    method: "lower_of_both",
    dsrCap: 0.35,
    surplusShare: 0.33,
    deductExistingCommitments: true,
    floorKes: 500,
    ceilingKes: 0,
    roundToKes: 100,
    countBankTransfersAsSpend: false,
  },

  score: {
    base: 500,
    min: 250,
    max: 900,
    drivers: {
      incomeLevel:         { enabled: true, weight: 70 },
      incomeStability:     { enabled: true, weight: 50 },
      earningConsistency:  { enabled: true, weight: 40 },
      disposableIncome:    { enabled: true, weight: 40 },
      loanDependency:      { enabled: true, weight: 80 },
      loanRepayment:       { enabled: true, weight: 30 },
      gambling:            { enabled: true, weight: 90 },
      savings:             { enabled: true, weight: 25 },
      fulizaReliance:      { enabled: true, weight: 30 },
      lenderCount:         { enabled: true, weight: 35 },
      unregisteredLenders: { enabled: true, weight: 25 },
      balanceCushion:      { enabled: true, weight: 20 },
    },
    bands: [
      { min: 800, label: "Excellent", pd: 0.03 },
      { min: 700, label: "Good", pd: 0.07 },
      { min: 600, label: "Fair", pd: 0.18 },
      { min: 450, label: "Poor", pd: 0.34 },
      { min: 0,   label: "Very poor", pd: 0.55 },
    ],
  },

  thresholds: {
    gamblingWatch: 0.02,
    loanDependencyWatch: 0.15,
    fulizaEvents: 4,
    volatilityStable: 0.5,
    volatilityErratic: 1.0,
    lenderCountWatch: 3,
  },
};

// ── Human labels, shared by the console form and the report's method page ────

export const INCOME_BASIS_LABEL: Record<IncomeBasis, { title: string; detail: string }> = {
  statement_total_in: {
    title: "Statement total paid in",
    detail: "Safaricom's own TOTAL · PAID IN line, divided by the statement period. Includes borrowing, which is shown separately.",
  },
  net_of_borrowing: {
    title: "Total paid in, less borrowing",
    detail: "The same total with every identified loan draw-down removed. The money that was earned rather than raised.",
  },
  classified_income: {
    title: "Classified income only",
    detail: "Rows the engine identifies as salary, business receipts or deposits. The narrowest and most conservative reading.",
  },
  received_money_only: {
    title: "Received money only",
    detail: "Safaricom's RECEIVED MONEY line: person-to-person receipts alone.",
  },
};

export const MONTHS_BASIS_LABEL: Record<MonthsBasis, { title: string; detail: string }> = {
  declared_period: {
    title: "Declared statement period",
    detail: "The period printed on the statement, whether or not the customer transacted in every month. A dormant month stays in the denominator.",
  },
  observed_months: {
    title: "Months with activity",
    detail: "Only the months that carry transactions. Raises the average for a customer with quiet months.",
  },
};

export const METHOD_LABEL: Record<AffordabilityMethod, { title: string; detail: string }> = {
  dsr_on_income: {
    title: "Debt service ratio on income",
    detail: "A capped share of monthly income, less instalments already committed to other lenders.",
  },
  share_of_surplus: {
    title: "Share of monthly surplus",
    detail: "A share of what is actually left after everything the customer already spends.",
  },
  lower_of_both: {
    title: "The lower of the two",
    detail: "Runs both and takes the smaller. The conservative reading, and the default.",
  },
};

export const DRIVER_LABEL: Record<ScoreDriverKey, { title: string; detail: string; direction: "positive" | "negative" | "signed" }> = {
  incomeLevel:         { title: "Income level", detail: "How much comes in each month, on the chosen basis.", direction: "signed" },
  incomeStability:     { title: "Income stability", detail: "How much the monthly figure swings.", direction: "signed" },
  earningConsistency:  { title: "Earning consistency", detail: "The share of months with any income at all.", direction: "positive" },
  disposableIncome:    { title: "Disposable income", detail: "What is left after spending, as a share of income.", direction: "signed" },
  loanDependency:      { title: "Loan dependency", detail: "The share of money in that was borrowed rather than earned.", direction: "negative" },
  loanRepayment:       { title: "Loan repayment", detail: "Whether borrowing is being repaid, and how regularly.", direction: "signed" },
  gambling:            { title: "Betting activity", detail: "The share of outflow going to licensed betting operators.", direction: "negative" },
  savings:             { title: "Saving behaviour", detail: "Regular transfers into savings products.", direction: "positive" },
  fulizaReliance:      { title: "Overdraft reliance", detail: "How often the wallet runs on Fuliza.", direction: "negative" },
  lenderCount:         { title: "Number of lenders", detail: "How many separate credit providers are being serviced.", direction: "negative" },
  unregisteredLenders: { title: "Unregistered lenders", detail: "Credit providers that appear on no CBK or SASRA register held here.", direction: "negative" },
  balanceCushion:      { title: "Balance cushion", detail: "Whether a working balance is kept between receipts.", direction: "positive" },
};

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Bring an arbitrary object into the policy's shape.
 *
 * Anything missing falls back to the default rather than to zero: a member who
 * saves a form with one field blank must not silently switch a scoring driver
 * off. Anything out of range is clamped, and the clamp is reported so the
 * console can say "we saved 0.6, not the 6 you typed".
 */
export function normalisePolicy(
  input: unknown,
  memberCode = "default",
): { policy: CrunchPolicy; adjusted: string[] } {
  const adjusted: string[] = [];
  const src = (input ?? {}) as Partial<CrunchPolicy>;
  const d = DEFAULT_POLICY;

  const clamp = (v: unknown, lo: number, hi: number, fallback: number, what: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    if (n < lo || n > hi) {
      const c = Math.max(lo, Math.min(hi, n));
      adjusted.push(`${what} ${n} is outside ${lo}–${hi}; saved as ${c}.`);
      return c;
    }
    return n;
  };

  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T, what: string): T => {
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
    if (v !== undefined) adjusted.push(`${what} "${String(v)}" is not a recognised option; kept ${fallback}.`);
    return fallback;
  };

  const inc: Partial<CrunchPolicy["income"]> = src.income ?? {};
  const aff: Partial<CrunchPolicy["affordability"]> = src.affordability ?? {};
  const sc: Partial<CrunchPolicy["score"]> = src.score ?? {};
  const th: Partial<CrunchPolicy["thresholds"]> = src.thresholds ?? {};

  const drivers = {} as Record<ScoreDriverKey, DriverSetting>;
  for (const key of Object.keys(d.score.drivers) as ScoreDriverKey[]) {
    const got = (sc.drivers ?? {})[key] as Partial<DriverSetting> | undefined;
    drivers[key] = {
      enabled: typeof got?.enabled === "boolean" ? got.enabled : d.score.drivers[key].enabled,
      weight: clamp(got?.weight ?? d.score.drivers[key].weight, 0, 200, d.score.drivers[key].weight, `Weight for ${DRIVER_LABEL[key].title}`),
    };
  }

  const policy: CrunchPolicy = {
    version: d.version,
    memberCode,
    label: typeof src.label === "string" && src.label.trim() ? src.label.trim().slice(0, 80) : d.label,
    updatedAt: new Date().toISOString().slice(0, 10),
    updatedBy: typeof src.updatedBy === "string" ? src.updatedBy.slice(0, 120) : null,
    income: {
      basis: pick(inc.basis, ["statement_total_in", "net_of_borrowing", "classified_income", "received_money_only"] as const, d.income.basis, "Income basis"),
      monthsBasis: pick(inc.monthsBasis, ["declared_period", "observed_months"] as const, d.income.monthsBasis, "Months basis"),
      excludeSelfTransfers: typeof inc.excludeSelfTransfers === "boolean" ? inc.excludeSelfTransfers : d.income.excludeSelfTransfers,
      excludeReversals: typeof inc.excludeReversals === "boolean" ? inc.excludeReversals : d.income.excludeReversals,
      countBankBulkAsIncome: typeof inc.countBankBulkAsIncome === "boolean" ? inc.countBankBulkAsIncome : d.income.countBankBulkAsIncome,
    },
    affordability: {
      method: pick(aff.method, ["dsr_on_income", "share_of_surplus", "lower_of_both"] as const, d.affordability.method, "Affordability method"),
      dsrCap: clamp(aff.dsrCap ?? d.affordability.dsrCap, 0.05, 0.9, d.affordability.dsrCap, "Debt service cap"),
      surplusShare: clamp(aff.surplusShare ?? d.affordability.surplusShare, 0.05, 1, d.affordability.surplusShare, "Surplus share"),
      deductExistingCommitments: typeof aff.deductExistingCommitments === "boolean" ? aff.deductExistingCommitments : d.affordability.deductExistingCommitments,
      floorKes: clamp(aff.floorKes ?? d.affordability.floorKes, 0, 100_000, d.affordability.floorKes, "Instalment floor"),
      ceilingKes: clamp(aff.ceilingKes ?? d.affordability.ceilingKes, 0, 10_000_000, d.affordability.ceilingKes, "Instalment ceiling"),
      roundToKes: clamp(aff.roundToKes ?? d.affordability.roundToKes, 1, 10_000, d.affordability.roundToKes, "Rounding step"),
      countBankTransfersAsSpend: typeof aff.countBankTransfersAsSpend === "boolean" ? aff.countBankTransfersAsSpend : d.affordability.countBankTransfersAsSpend,
    },
    score: {
      base: clamp(sc.base ?? d.score.base, 250, 900, d.score.base, "Score base"),
      min: clamp(sc.min ?? d.score.min, 0, 900, d.score.min, "Score minimum"),
      max: clamp(sc.max ?? d.score.max, 100, 1000, d.score.max, "Score maximum"),
      drivers,
      bands: Array.isArray(sc.bands) && sc.bands.length ? sc.bands : d.score.bands,
    },
    thresholds: {
      gamblingWatch: clamp(th.gamblingWatch ?? d.thresholds.gamblingWatch, 0, 1, d.thresholds.gamblingWatch, "Betting threshold"),
      loanDependencyWatch: clamp(th.loanDependencyWatch ?? d.thresholds.loanDependencyWatch, 0, 1, d.thresholds.loanDependencyWatch, "Loan dependency threshold"),
      fulizaEvents: clamp(th.fulizaEvents ?? d.thresholds.fulizaEvents, 0, 1000, d.thresholds.fulizaEvents, "Fuliza event threshold"),
      volatilityStable: clamp(th.volatilityStable ?? d.thresholds.volatilityStable, 0, 5, d.thresholds.volatilityStable, "Stable volatility"),
      volatilityErratic: clamp(th.volatilityErratic ?? d.thresholds.volatilityErratic, 0, 10, d.thresholds.volatilityErratic, "Erratic volatility"),
      lenderCountWatch: clamp(th.lenderCountWatch ?? d.thresholds.lenderCountWatch, 0, 50, d.thresholds.lenderCountWatch, "Lender count threshold"),
    },
  };

  if (policy.score.min >= policy.score.max) {
    adjusted.push("Score minimum was at or above the maximum; the default range was restored.");
    policy.score.min = d.score.min;
    policy.score.max = d.score.max;
  }
  policy.score.bands = [...policy.score.bands].sort((a, b) => b.min - a.min);

  return { policy, adjusted };
}

/** Everything a member changed from the Interchange default, for the report. */
export function policyDiff(policy: CrunchPolicy): { setting: string; value: string; default: string }[] {
  const d = DEFAULT_POLICY;
  const out: { setting: string; value: string; default: string }[] = [];
  const add = (setting: string, value: unknown, def: unknown) => {
    if (String(value) !== String(def)) out.push({ setting, value: String(value), default: String(def) });
  };

  add("Income basis", INCOME_BASIS_LABEL[policy.income.basis].title, INCOME_BASIS_LABEL[d.income.basis].title);
  add("Months basis", MONTHS_BASIS_LABEL[policy.income.monthsBasis].title, MONTHS_BASIS_LABEL[d.income.monthsBasis].title);
  add("Exclude self-transfers", policy.income.excludeSelfTransfers, d.income.excludeSelfTransfers);
  add("Exclude reversals", policy.income.excludeReversals, d.income.excludeReversals);
  add("Bank bulk credits count as income", policy.income.countBankBulkAsIncome, d.income.countBankBulkAsIncome);
  add("Affordability method", METHOD_LABEL[policy.affordability.method].title, METHOD_LABEL[d.affordability.method].title);
  add("Debt service cap", `${Math.round(policy.affordability.dsrCap * 100)}%`, `${Math.round(d.affordability.dsrCap * 100)}%`);
  add("Share of surplus", `${Math.round(policy.affordability.surplusShare * 100)}%`, `${Math.round(d.affordability.surplusShare * 100)}%`);
  add("Deduct existing commitments", policy.affordability.deductExistingCommitments, d.affordability.deductExistingCommitments);
  add("Instalment floor", `KES ${policy.affordability.floorKes}`, `KES ${d.affordability.floorKes}`);
  add("Bank transfers count as spending", policy.affordability.countBankTransfersAsSpend, d.affordability.countBankTransfersAsSpend);
  add("Instalment ceiling", policy.affordability.ceilingKes ? `KES ${policy.affordability.ceilingKes}` : "none", d.affordability.ceilingKes ? `KES ${d.affordability.ceilingKes}` : "none");

  for (const key of Object.keys(d.score.drivers) as ScoreDriverKey[]) {
    const a = policy.score.drivers[key];
    const b = d.score.drivers[key];
    if (!a.enabled && b.enabled) out.push({ setting: `${DRIVER_LABEL[key].title} weight`, value: "off", default: String(b.weight) });
    else if (a.weight !== b.weight || a.enabled !== b.enabled) out.push({ setting: `${DRIVER_LABEL[key].title} weight`, value: String(a.weight), default: String(b.weight) });
  }
  return out;
}
