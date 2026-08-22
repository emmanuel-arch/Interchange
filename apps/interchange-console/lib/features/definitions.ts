// ─────────────────────────────────────────────────────────────────────────────
// The feature registry.
//
// ONE definition per feature, used by BOTH training and serving. That is the
// only reliable defence against training/serving skew: the moment a feature is
// computed by one query in a notebook and a different query in production, the
// model is scoring on something it was never trained on, and nothing in the
// metrics will tell you.
//
// Every feature here is a pure function of a bitemporal event slice. It cannot
// reach for "current" state, cannot query the network, and cannot see anything
// the caller did not already filter to the as-of instant. Point-in-time
// correctness is enforced by the shape of this interface, not by discipline.
//
// Blueprint v2 §4 specifies ~120 features across eight families. Implemented
// here are the families computable from the ecosystem ledger; the ones sourced
// from the LMS (M-Pesa cashflow, KYC, application form) are declared with their
// family and left `unavailable`, because a model must be able to tell the
// difference between "zero" and "we do not know".
// ─────────────────────────────────────────────────────────────────────────────

export const FEATURE_SET_VERSION = "fs-2026.08.1";

export type LedgerSlice = {
  subjectToken: string;
  asOf: Date;
  events: {
    memberId: string;
    at: Date;
    kind: string;
    amountKes: number | null;
    daysPastDue: number | null;
  }[];
};

export type Family =
  | "identity_kyc"
  | "mpesa_cashflow"
  | "application"
  | "bureau"
  | "ecosystem_exposure"
  | "repayment_behaviour"
  | "collections"
  | "ecosystem_intent";

export type FeatureDef = {
  name: string;
  family: Family;
  description: string;
  /** Direction the model may assume, where credit sense fixes it. */
  monotonic?: "increasing" | "decreasing";
  compute: (s: LedgerSlice) => number | null;
};

const days = (ms: number) => ms / 86_400_000;

function within(s: LedgerSlice, windowDays: number) {
  const cutoff = s.asOf.getTime() - windowDays * 86_400_000;
  return s.events.filter((e) => e.at.getTime() >= cutoff);
}

const byKind = (s: LedgerSlice, kind: string) => s.events.filter((e) => e.kind === kind);

export const FEATURES: FeatureDef[] = [
  // ── Ecosystem exposure ───────────────────────────────────────────────────
  {
    name: "eco_active_lenders",
    family: "ecosystem_exposure",
    description: "Distinct members with a disbursement not yet closed.",
    monotonic: "increasing",
    compute: (s) => {
      const open = new Map<string, number>();
      for (const e of s.events) {
        if (e.kind === "DISBURSED") open.set(e.memberId, (open.get(e.memberId) ?? 0) + 1);
        if (e.kind === "CLOSED") open.set(e.memberId, (open.get(e.memberId) ?? 0) - 1);
      }
      return [...open.values()].filter((v) => v > 0).length;
    },
  },
  {
    name: "eco_active_loans",
    family: "ecosystem_exposure",
    description: "Disbursements not yet closed, across all members.",
    monotonic: "increasing",
    compute: (s) => byKind(s, "DISBURSED").length - byKind(s, "CLOSED").length,
  },
  {
    name: "eco_outstanding_kes",
    family: "ecosystem_exposure",
    description: "Disbursed minus repaid, across all members.",
    monotonic: "increasing",
    compute: (s) => {
      const out = s.events.reduce((a, e) => {
        if (e.kind === "DISBURSED") return a + (e.amountKes ?? 0);
        if (e.kind === "REPAYMENT") return a - (e.amountKes ?? 0);
        return a;
      }, 0);
      return Math.max(0, out);
    },
  },
  {
    name: "eco_velocity_7d",
    family: "ecosystem_exposure",
    description: "Disbursements taken in the last 7 days.",
    monotonic: "increasing",
    compute: (s) => within(s, 7).filter((e) => e.kind === "DISBURSED").length,
  },
  {
    name: "eco_velocity_14d",
    family: "ecosystem_exposure",
    description: "Disbursements taken in the last 14 days. The stacking signal.",
    monotonic: "increasing",
    compute: (s) => within(s, 14).filter((e) => e.kind === "DISBURSED").length,
  },
  {
    name: "eco_velocity_30d",
    family: "ecosystem_exposure",
    description: "Disbursements taken in the last 30 days.",
    monotonic: "increasing",
    compute: (s) => within(s, 30).filter((e) => e.kind === "DISBURSED").length,
  },
  {
    name: "eco_days_since_newest_loan",
    family: "ecosystem_exposure",
    description: "Days since the most recent disbursement anywhere.",
    monotonic: "decreasing",
    compute: (s) => {
      const d = byKind(s, "DISBURSED").map((e) => e.at.getTime()).sort();
      if (!d.length) return null;
      return Math.floor(days(s.asOf.getTime() - d[d.length - 1]));
    },
  },

  // ── Repayment behaviour ──────────────────────────────────────────────────
  {
    name: "rep_worst_dpd",
    family: "repayment_behaviour",
    description: "Worst days-past-due ever observed.",
    monotonic: "increasing",
    compute: (s) => {
      const d = byKind(s, "ARREARS").map((e) => e.daysPastDue ?? 0);
      return d.length ? Math.max(...d) : 0;
    },
  },
  {
    name: "rep_worst_dpd_90d",
    family: "repayment_behaviour",
    description: "Worst days-past-due in the last 90 days.",
    monotonic: "increasing",
    compute: (s) => {
      const d = within(s, 90).filter((e) => e.kind === "ARREARS").map((e) => e.daysPastDue ?? 0);
      return d.length ? Math.max(...d) : 0;
    },
  },
  {
    name: "rep_arrears_episodes",
    family: "repayment_behaviour",
    description: "Count of arrears events observed.",
    monotonic: "increasing",
    compute: (s) => byKind(s, "ARREARS").length,
  },
  {
    name: "rep_repayments",
    family: "repayment_behaviour",
    description: "Count of repayment events.",
    monotonic: "decreasing",
    compute: (s) => byKind(s, "REPAYMENT").length,
  },
  {
    name: "rep_loans_closed",
    family: "repayment_behaviour",
    description: "Loans seen through to closure.",
    monotonic: "decreasing",
    compute: (s) => byKind(s, "CLOSED").length,
  },
  {
    name: "rep_closure_ratio",
    family: "repayment_behaviour",
    description: "Closed over disbursed. Low means many still running.",
    compute: (s) => {
      const d = byKind(s, "DISBURSED").length;
      return d === 0 ? null : byKind(s, "CLOSED").length / d;
    },
  },
  {
    name: "rep_tenure_days",
    family: "repayment_behaviour",
    description: "Days since first seen anywhere in the ecosystem.",
    monotonic: "decreasing",
    compute: (s) => {
      if (!s.events.length) return null;
      const first = Math.min(...s.events.map((e) => e.at.getTime()));
      return Math.floor(days(s.asOf.getTime() - first));
    },
  },

  // ── Ecosystem intent ─────────────────────────────────────────────────────
  {
    name: "int_applications_30d",
    family: "ecosystem_intent",
    description: "Applications across all members in the last 30 days.",
    monotonic: "increasing",
    compute: (s) => within(s, 30).filter((e) => e.kind === "APPLICATION").length,
  },
  {
    name: "int_declines_30d",
    family: "ecosystem_intent",
    description: "Declines across all members in the last 30 days.",
    monotonic: "increasing",
    compute: (s) => within(s, 30).filter((e) => e.kind === "DECLINE").length,
  },
  {
    name: "int_decline_rate_30d",
    family: "ecosystem_intent",
    description: "Share of recent applications that were declined elsewhere.",
    monotonic: "increasing",
    compute: (s) => {
      const apps = within(s, 30).filter((e) => e.kind === "APPLICATION").length;
      if (apps === 0) return null;
      return within(s, 30).filter((e) => e.kind === "DECLINE").length / apps;
    },
  },
  {
    name: "int_shopping_breadth_30d",
    family: "ecosystem_intent",
    description: "Distinct members applied to in the last 30 days.",
    monotonic: "increasing",
    compute: (s) =>
      new Set(within(s, 30).filter((e) => e.kind === "APPLICATION").map((e) => e.memberId)).size,
  },
];

/**
 * Families sourced outside the ecosystem ledger. Declared so a vector can say
 * "unavailable" rather than silently omitting them — a model must be able to
 * distinguish a zero from an unknown, and a missing key from a real absence.
 */
export const PENDING_FAMILIES: { family: Family; source: string; planned: number }[] = [
  { family: "mpesa_cashflow", source: "LMS statement cruncher", planned: 38 },
  { family: "identity_kyc", source: "LMS onboarding", planned: 12 },
  { family: "application", source: "LMS origination funnel", planned: 10 },
  { family: "bureau", source: "Metropol (blocked on IP allow-listing)", planned: 14 },
  { family: "collections", source: "CollectBox", planned: 12 },
];

export const FEATURE_NAMES = FEATURES.map((f) => f.name);
