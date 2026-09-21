// ─────────────────────────────────────────────────────────────────────────────
// THE INTERCHANGE REPORT CATALOGUE — what a member can buy, and what it costs.
//
// ── THE COMMERCIAL SHAPE, AND WHY IT IS THIS SHAPE ───────────────────────────
// Metropol sell per report, per pull, with no free tier: a lender integrates
// once and then pays for every question, including the ones that turn out to be
// about a borrower they already know. That model is what makes bureau data
// expensive to use defensively — you cannot afford to check often.
//
// The Interchange charges on the same AXIS, so a member already integrated with
// Metropol understands the bill without a meeting, and then differs in two ways
// that are the whole pitch:
//
//   1. ECOSYSTEM-NATIVE REPORTS ARE FREE ABOVE A CONTRIBUTION-LINKED TIER.
//      Exposure, delinquency, intent and cohort are computed from members'
//      own live books. The marginal cost of answering is a few milliseconds of
//      somebody else's Postgres, so charging per query would be rent, not price.
//      What a member "pays" is contribution: publish your book, query the
//      network. Stop publishing and the free tier goes to zero — enforced in
//      the policy engine, not in a contract.
//
//   2. BUREAU-BACKED REPORTS ARE PASSTHROUGH PLUS A STATED MARGIN.
//      A Metropol pull costs real money on somebody's contract. The member who
//      holds that contract (Micromart today) makes the call and is reimbursed;
//      the Interchange adds a margin that is PRINTED ON THE INVOICE rather than
//      buried in a blended rate. A member who wants the bureau relationship
//      themselves can go and get one — the point is that they do not have to.
//
// ── ON THE PRICES BELOW ──────────────────────────────────────────────────────
// `bureauCost` is Metropol's price for the report set, NET, from their rate card
// ("MICROMART API Rate Card – V2", lib/codes/metropol-rate-card.ts) — derived
// from each entry's own `bureauReports`, never typed beside it. 16% VAT and 10%
// excise come on top (grossOf). Report 16 is not on the card, so a bundle that
// includes it is priced WITHOUT it and says so rather than guessing.
// ─────────────────────────────────────────────────────────────────────────────

import { cardCost } from "@/lib/codes/metropol-rate-card";

export type ReportSource =
  /** Computed from members' live books. No third party, no marginal cost. */
  | "ecosystem"
  /** Fetched from Metropol by the member holding the contract. Billed per pull. */
  | "bureau"
  /** Both, assembled into one document. */
  | "hybrid";

/**
 * `bundle` is JSON plus the rendered PDF, base64, in ONE response.
 *
 * It exists because a bureau pull costs money: a caller that wants both the
 * structured file (to store, to score, to satisfy a stage gate) and the
 * document (to hand to an officer) would otherwise have to ask twice and be
 * billed twice for the same bytes. One pull, one render, both artefacts.
 */
export type ReportFormat = "json" | "pdf" | "html" | "bundle";

export type InterchangeReport = {
  /** Metropol's integer where an equivalent exists; 20+ where it does not. */
  type: number;
  code: string;
  name: string;
  /** The decision question, in a credit officer's words. */
  answers: string;
  source: ReportSource;
  /** Consent scopes a caller must hold. Enforced by the gate, not by this list. */
  requiredScopes: string[];
  /** Metropol report types this is assembled from, where source involves the bureau. */
  bureauReports: number[];
  formats: ReportFormat[];
  /** What Metropol charge for the nearest equivalent, indicative, KES. */
  bureauCost: number;
  /** The Interchange's fee on top, KES. Zero where the answer costs us nothing. */
  interchangeFee: number;
  /** False while specified but not yet answering. */
  live: boolean;
  /** What a lender gets here that a bureau report cannot contain. */
  edge?: string;
};

export const REPORTS: InterchangeReport[] = [
  {
    type: 1,
    code: "report-1",
    name: "Identity Verification",
    answers: "Is this ID real, and is it the person in front of me?",
    source: "bureau",
    requiredScopes: ["kyc.verify"],
    bureauReports: [1],
    formats: ["json", "pdf", "html", "bundle"],
    bureauCost: cardCost([1]).net,
    interchangeFee: 2,
    live: true,
  },
  {
    type: 2,
    code: "report-2",
    name: "Delinquency Status",
    answers: "Are they in default right now, anywhere in this ecosystem?",
    source: "ecosystem",
    requiredScopes: ["ecosystem.exposure"],
    bureauReports: [],
    formats: ["json", "pdf", "html", "bundle"],
    bureauCost: cardCost([]).net,
    interchangeFee: 0,
    live: true,
    edge: "Live from member books, where the bureau's equivalent is a monthly submission cycle behind.",
  },
  {
    type: 3,
    code: "report-3",
    name: "Interchange Score",
    answers: "What is the network's number on this person, and why?",
    source: "hybrid",
    requiredScopes: ["ecosystem.exposure", "mpesa.crunch", "model.train"],
    bureauReports: [3],
    formats: ["json", "pdf", "html", "bundle"],
    bureauCost: cardCost([3]).net,
    interchangeFee: 5,
    live: false,
    edge: "Reason codes from SHAP, and a model trained on outcomes the bureau never sees — including loans other members declined.",
  },
  {
    type: 11,
    code: "report-11",
    name: "Cashflow & Affordability",
    answers: "What can they actually afford to repay each month?",
    source: "hybrid",
    requiredScopes: ["mpesa.crunch"],
    bureauReports: [11],
    formats: ["json", "pdf", "html", "bundle"],
    bureauCost: cardCost([11]).net,
    interchangeFee: 10,
    live: false,
    edge: "M-Pesa statement features computed from the rail itself, not a bureau's income model.",
  },
  {
    type: 8,
    code: "report-8",
    name: "Credit Info",
    answers: "Every credit account on file, and how each one is performing.",
    source: "bureau",
    requiredScopes: ["bureau.pull"],
    // Metropol's report 8 on its own: the account list, the sector split, the
    // enquiry windows and the headline score that report 12 does NOT carry.
    // Kept as its own product rather than folded into 12 because it is the
    // cheapest pull that still answers "what do they already owe, and to whom",
    // which is the question most officer reviews actually turn on.
    bureauReports: [8],
    formats: ["json", "pdf", "html", "bundle"],
    bureauCost: cardCost([8]).net,
    interchangeFee: 10,
    live: true,
    edge:
      "The same bureau bytes a direct Metropol integration returns, re-read as a decision: live totals, concentration, arrears staleness, and the accounts that actually carry the risk.",
  },
  {
    type: 12,
    code: "report-12",
    name: "Credit File",
    answers: "Everything on file, read as a decision rather than as a dump.",
    source: "hybrid",
    requiredScopes: ["bureau.pull"],
    // 12 carries identity, scrub and the 12-month trend; 8 carries the headline
    // score that 12 omits; 11 carries income; 16 carries the instalment load.
    bureauReports: [12, 8, 11, 16],
    formats: ["json", "pdf", "html", "bundle"],
    bureauCost: cardCost([12, 8, 11, 16]).net,
    interchangeFee: 35,
    live: true,
    edge:
      "Totals, concentration, staleness and stacking velocity computed on top of the bureau's own fields — none of which appear on Metropol's own report.",
  },
  {
    type: 20,
    code: "exposure-v1",
    name: "Ecosystem Exposure",
    answers: "Is this borrower, who looks clean to me, servicing loans elsewhere right now?",
    source: "ecosystem",
    requiredScopes: ["ecosystem.exposure"],
    bureauReports: [],
    formats: ["json", "pdf", "html", "bundle"],
    bureauCost: cardCost([]).net,
    interchangeFee: 0,
    live: true,
    edge: "No bureau can sell this. It is answered from live books in under half a second, and it is free at the point of use.",
  },
  {
    type: 21,
    code: "report-21",
    name: "Intent Signal",
    answers: "Who is this borrower shopping with right now?",
    source: "ecosystem",
    requiredScopes: ["ecosystem.exposure"],
    bureauReports: [],
    formats: ["json", "pdf", "html", "bundle"],
    bureauCost: cardCost([]).net,
    interchangeFee: 0,
    live: false,
    edge: "Applications across members in the last 30 days, approved and declined. A bureau sees neither.",
  },
  {
    type: 22,
    code: "report-22",
    name: "Contactability",
    answers: "When and how do we actually reach this person?",
    source: "ecosystem",
    requiredScopes: ["collections.contact"],
    bureauReports: [],
    formats: ["json", "pdf", "html", "bundle"],
    bureauCost: cardCost([]).net,
    interchangeFee: 0,
    live: false,
    edge:
      "Built on 1.34M call dispositions and 150K promises-to-pay already in CollectBox. Note the number collision: Metropol's own report 22 is a 12-month account history and is NOT in Micromart's contract (E029).",
  },
  {
    type: 23,
    code: "report-23",
    name: "Cohort Benchmark",
    answers: "How does this borrower compare with their peers across the ecosystem?",
    source: "ecosystem",
    requiredScopes: ["ecosystem.exposure", "model.train"],
    bureauReports: [],
    formats: ["json", "pdf", "html", "bundle"],
    bureauCost: cardCost([]).net,
    interchangeFee: 0,
    live: false,
  },
];

export const reportByType = (type: number) => REPORTS.find((r) => r.type === type);
export const reportByCode = (code: string) => REPORTS.find((r) => r.code === code);
export const liveReports = () => REPORTS.filter((r) => r.live);

export type Quote = {
  type: number;
  name: string;
  bureauCost: number;
  interchangeFee: number;
  total: number;
  /** True when the caller's contribution-linked free tier covers this call. */
  freeAtPointOfUse: boolean;
  tariffSource: "metropol" | "indicative";
  currency: "KES";
};

/**
 * What one call costs this member.
 *
 * Ecosystem-native reports are free at the point of use for a CONTRIBUTING
 * member and refused outright for one that has stopped — the gate decides that,
 * not this function. What is priced here is the part with a real marginal cost.
 */
export function quote(type: number, opts: { contributing: boolean; tariffLoaded?: boolean } = { contributing: true }): Quote | null {
  const r = reportByType(type);
  if (!r) return null;
  const free = r.source === "ecosystem" && opts.contributing;
  return {
    type: r.type,
    name: r.name,
    bureauCost: free ? 0 : r.bureauCost,
    interchangeFee: free ? 0 : r.interchangeFee,
    total: free ? 0 : r.bureauCost + r.interchangeFee,
    freeAtPointOfUse: free,
    // "metropol" whenever the rate card prices every report in the set; a bundle
    // holding an unpriced one (16) is flagged rather than quoted as though whole.
    tariffSource: opts.tariffLoaded || cardCost(r.bureauReports).unpriced.length === 0 ? "metropol" : "indicative",
    currency: "KES",
  };
}
