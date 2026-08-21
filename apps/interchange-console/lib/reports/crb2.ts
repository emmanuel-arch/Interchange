// ─────────────────────────────────────────────────────────────────────────────
// CRB 2.0 report assembly.
//
// The envelope deliberately mirrors Metropol's: same `api_code` semantics, same
// report-type integers where an equivalent exists. A member already integrated
// with Metropol changes a base URL and a key pair and keeps their parsing code.
// That constraint costs us some elegance and buys the cheapest possible
// migration path, which is the right trade at this stage.
//
// A report is ASSEMBLED from whichever evidence blocks exist for that borrower,
// not fetched from a fixed table. A borrower who has been KYC-verified, M-Pesa
// crunched, bureau-pulled and scored yields a full report; a fresh applicant
// yields the blocks that exist and the rest marked `unavailable` — never
// fabricated, and never silently omitted, because a missing block and a clean
// block mean opposite things to a credit decision.
// ─────────────────────────────────────────────────────────────────────────────
import type { ExposureResult } from "@/lib/exposure/broker";

export const REPORT_TYPE = {
  IDENTITY_VERIFICATION: 1,
  DELINQUENCY_STATUS: 2,
  INTERCHANGE_SCORE: 3,
  CASHFLOW_AFFORDABILITY: 11,
  FULL_ENHANCED: 12,
  ECOSYSTEM_EXPOSURE: 20,
  INTENT_SIGNAL: 21,
  CONTACTABILITY: 22,
  COHORT_BENCHMARK: 23,
} as const;

export type BlockStatus = "present" | "unavailable";

export type Envelope = {
  api_code: number | string;
  api_code_description: string;
  report_type: number;
  subject_token: string;
  generated_at: string;
  /** Which evidence blocks were available. Absence is reported, never hidden. */
  blocks: Record<string, BlockStatus>;
  /** True when a member node did not answer in time. */
  partial: boolean;
  data: Record<string, unknown>;
};

const DELINQUENCY_CODE: Record<string, { code: string; label: string }> = {
  prepayment: { code: "003", label: "No delinquency (clean)" },
  due: { code: "003", label: "No delinquency (clean)" },
  watch_1: { code: "004", label: "Currently delinquent" },
  watch_2: { code: "004", label: "Currently delinquent" },
  watch_3: { code: "004", label: "Currently delinquent" },
  npl: { code: "004", label: "Currently delinquent" },
};

/** Report 20 — Ecosystem Exposure. The one no bureau can sell. */
export function ecosystemExposure(e: ExposureResult): Envelope {
  return {
    api_code: 200,
    api_code_description: "SUCCESS",
    report_type: REPORT_TYPE.ECOSYSTEM_EXPOSURE,
    subject_token: e.subjectToken,
    generated_at: e.asOf,
    blocks: { ecosystem_exposure: "present" },
    partial: e.partial,
    data: {
      active_loans: e.activeLoans,
      lenders: e.lenders,
      outstanding_band: e.outstandingBand,
      worst_bucket: e.worstBucket,
      newest_disbursement: e.newestDisbursement,
      // The signal that matters. A borrower who took credit from two more
      // lenders in the last fortnight is a different risk from one who has held
      // the same three loans for a year — and the totals alone cannot tell them
      // apart.
      velocity_14d: e.velocity14d,
      lenders_named: e.lendersNamed,
      coverage: {
        screened: e.screened,
        queried: e.queried,
        responded: e.responded,
        partial: e.partial,
      },
    },
  };
}

/** Report 2 — Delinquency Status. Metropol-shaped, ecosystem-wide. */
export function delinquencyStatus(e: ExposureResult): Envelope {
  const d = DELINQUENCY_CODE[e.worstBucket] ?? { code: "002", label: "No account information" };
  const clean = e.lenders === 0;
  return {
    api_code: 200,
    api_code_description: "SUCCESS",
    report_type: REPORT_TYPE.DELINQUENCY_STATUS,
    subject_token: e.subjectToken,
    generated_at: e.asOf,
    blocks: { ecosystem_exposure: "present" },
    partial: e.partial,
    data: {
      delinquency_code: clean ? "002" : d.code,
      delinquency_description: clean ? "No account information" : d.label,
      worst_bucket: clean ? null : e.worstBucket,
      accounts: e.activeLoans,
      institutions: e.lenders,
    },
  };
}

/**
 * Report 1 — Identity Verification.
 *
 * Returns `unavailable` on purpose. The KYC evidence block is produced by the
 * LMS onboarding flow and is not wired into the Interchange yet, and a report
 * that invented an identity result would be far worse than one that admits it
 * has none.
 */
export function identityVerification(subjectToken: string): Envelope {
  return {
    api_code: "E017",
    api_code_description: "NO DATA AVAILABLE FOR THIS REPORT TYPE",
    report_type: REPORT_TYPE.IDENTITY_VERIFICATION,
    subject_token: subjectToken,
    generated_at: new Date().toISOString(),
    blocks: { identity_kyc: "unavailable" },
    partial: false,
    data: {
      reason:
        "The KYC evidence block is produced during LMS onboarding and is not yet published to the Interchange.",
    },
  };
}

export function byReportType(type: number, e: ExposureResult): Envelope {
  switch (type) {
    case REPORT_TYPE.ECOSYSTEM_EXPOSURE:
      return ecosystemExposure(e);
    case REPORT_TYPE.DELINQUENCY_STATUS:
      return delinquencyStatus(e);
    case REPORT_TYPE.IDENTITY_VERIFICATION:
      return identityVerification(e.subjectToken);
    default:
      return {
        api_code: "E017",
        api_code_description: "NO DATA AVAILABLE FOR THIS REPORT TYPE",
        report_type: type,
        subject_token: e.subjectToken,
        generated_at: new Date().toISOString(),
        blocks: {},
        partial: false,
        data: { reason: `Report type ${type} is specified but not yet live.` },
      };
  }
}
