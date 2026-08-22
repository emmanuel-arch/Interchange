// ─────────────────────────────────────────────────────────────────────────────
// Model registry, champion/challenger, and serving.
//
// Promotion is a status change on a row. A model that can only be rolled back by
// shipping code will not be rolled back at 2am when its reason codes start
// looking wrong — and the moment you need a rollback is exactly the moment you
// cannot afford a deploy.
//
// A challenger scores live traffic WITHOUT deciding anything, and is promoted
// only when it beats the champion on data neither has trained on. Backtests are
// claims about the past; a shadow score is a claim about now.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { FEATURE_NAMES, FEATURES, FEATURE_SET_VERSION } from "@/lib/features/definitions";
import {
  predictLogistic, predictTrees, contributionsLogistic, contributionsTrees, toScore,
  type Logistic, type Trees,
} from "./model";
import type { TrainResult, Metrics } from "./train";

export type ReasonCode = {
  feature: string;
  family: string;
  contribution: number;
  direction: "raises risk" | "lowers risk";
  explanation: string;
};

export type Scored = {
  score: number;
  probability: number;
  modelVersion: string;
  featureSetVersion: string;
  reasons: ReasonCode[];
};

export async function register(result: TrainResult, status: "CHAMPION" | "CHALLENGER") {
  if (status === "CHAMPION") {
    await prisma.modelVersion.updateMany({ where: { status: "CHAMPION" }, data: { status: "RETIRED" } });
  }
  return prisma.modelVersion.create({
    data: {
      version: result.version,
      algorithm: result.algorithm,
      featureSetVersion: FEATURE_SET_VERSION,
      params: result.params as never,
      metrics: result.metrics as never,
      status,
      trainedOnRows: result.trainRows,
      trainStart: result.trainStart,
      trainEnd: result.trainEnd,
      testStart: result.testStart,
      testEnd: result.testEnd,
    },
  });
}

export async function champion() {
  return prisma.modelVersion.findFirst({ where: { status: "CHAMPION" }, orderBy: { trainedAt: "desc" } });
}

export async function challengers() {
  return prisma.modelVersion.findMany({ where: { status: "CHALLENGER" }, orderBy: { trainedAt: "desc" } });
}

const FAMILY_OF = new Map(FEATURES.map((f) => [f.name, f.family]));

/** Plain-language reason codes. A lender has to be able to tell a borrower why. */
function explain(name: string, raises: boolean): string {
  const phrases: Record<string, [string, string]> = {
    eco_active_lenders: ["borrowing from several lenders at once", "few other active lenders"],
    eco_active_loans: ["several loans running concurrently", "few concurrent loans"],
    eco_outstanding_kes: ["a high outstanding balance across the ecosystem", "a low outstanding balance"],
    eco_velocity_7d: ["new credit taken in the last week", "no new credit in the last week"],
    eco_velocity_14d: ["new credit taken from multiple lenders recently", "no recent credit stacking"],
    eco_velocity_30d: ["several loans taken in the last month", "no loans taken in the last month"],
    eco_days_since_newest_loan: ["a very recent disbursement elsewhere", "no recent borrowing"],
    rep_worst_dpd: ["a history of falling behind on payments", "no serious arrears on record"],
    rep_worst_dpd_90d: ["recent arrears", "no recent arrears"],
    rep_arrears_episodes: ["repeated arrears episodes", "few arrears episodes"],
    rep_repayments: ["few recorded repayments", "a consistent repayment record"],
    rep_loans_closed: ["few loans seen through to closure", "loans repaid and closed"],
    rep_closure_ratio: ["many loans still open relative to those closed", "a strong closure record"],
    rep_tenure_days: ["a short history in the ecosystem", "a long track record"],
    int_applications_30d: ["many recent credit applications", "few recent applications"],
    int_declines_30d: ["recent declines from other lenders", "no recent declines"],
    int_decline_rate_30d: ["a high share of recent applications declined", "applications generally approved"],
    int_shopping_breadth_30d: ["applying to many lenders in a short period", "not shopping widely"],
  };
  const p = phrases[name];
  if (!p) return name;
  return raises ? p[0] : p[1];
}

export function reasonsFor(
  params: Logistic | Trees,
  x: number[],
  limit = 5,
): ReasonCode[] {
  const contribs =
    params.kind === "logistic" ? contributionsLogistic(params, x) : contributionsTrees(params, x);

  return contribs
    .filter((c) => Math.abs(c.contribution) > 1e-6)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, limit)
    .map((c) => {
      // y = 1 is DEFAULT, so a positive contribution pushes toward risk.
      const raises = c.contribution > 0;
      return {
        feature: c.name,
        family: FAMILY_OF.get(c.name) ?? "unknown",
        contribution: c.contribution,
        direction: raises ? ("raises risk" as const) : ("lowers risk" as const),
        explanation: explain(c.name, raises),
      };
    });
}

export function vectorFrom(features: Record<string, unknown>): number[] {
  return FEATURE_NAMES.map((n) => {
    const v = features[n];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  });
}

export function scoreWith(
  model: { version: string; params: unknown; featureSetVersion: string },
  features: Record<string, unknown>,
): Scored {
  const params = model.params as Logistic | Trees;
  const x = vectorFrom(features);
  const probability = params.kind === "logistic" ? predictLogistic(params, x) : predictTrees(params, x);

  return {
    score: toScore(probability),
    probability,
    modelVersion: model.version,
    featureSetVersion: model.featureSetVersion,
    reasons: reasonsFor(params, x),
  };
}

/**
 * Record every challenger's opinion of a decision the champion already made.
 * Idempotent — re-running a shadow pass must not double-count.
 */
export async function shadowScore(decisionId: string, features: Record<string, unknown>) {
  const models = await challengers();
  for (const m of models) {
    const s = scoreWith(m, features);
    await prisma.shadowScore.upsert({
      where: { decisionId_modelVersionId: { decisionId, modelVersionId: m.id } },
      update: { score: s.score, probability: s.probability },
      create: { decisionId, modelVersionId: m.id, score: s.score, probability: s.probability },
    });
  }
}

export type Comparison = {
  championVersion: string | null;
  championAuc: number | null;
  challengerVersion: string;
  challengerAuc: number | null;
  verdict: "promote" | "hold";
  reason: string;
};

/**
 * Should this challenger be promoted?
 *
 * Deliberately conservative. A challenger has to clear the champion by a real
 * margin, not a rounding error — otherwise the registry churns on noise, and
 * every churn resets everyone's understanding of what the score means.
 */
export async function comparePromotion(minLift = 0.02): Promise<Comparison[]> {
  const champ = await champion();
  const champMetrics = champ ? (champ.metrics as unknown as Metrics) : null;
  const list = await challengers();

  return list.map((c) => {
    const m = c.metrics as unknown as Metrics;
    const champAuc = champMetrics?.auc ?? null;

    if (champAuc === null) {
      return {
        championVersion: null, championAuc: null,
        challengerVersion: c.version, challengerAuc: m.auc,
        verdict: "promote" as const, reason: "No champion in the registry.",
      };
    }
    const lift = m.auc - champAuc;
    return {
      championVersion: champ!.version,
      championAuc: champAuc,
      challengerVersion: c.version,
      challengerAuc: m.auc,
      verdict: lift >= minLift ? ("promote" as const) : ("hold" as const),
      reason:
        lift >= minLift
          ? `AUC +${lift.toFixed(3)} over champion on held-out data.`
          : `AUC ${lift >= 0 ? "+" : ""}${lift.toFixed(3)} — inside the ${minLift} noise band.`,
    };
  });
}
