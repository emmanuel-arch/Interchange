// ─────────────────────────────────────────────────────────────────────────────
// Training.
//
// THE SPLIT IS OUT-OF-TIME, NOT RANDOM. This is the single most important line
// in the file. A random split puts the same borrower, the same month and the
// same macro conditions on both sides, and the model scores brilliantly on data
// it has effectively already seen. Credit models are deployed FORWARD in time,
// so they must be validated forward in time. A random-split AUC is a number
// about nothing.
//
// The training set includes ECOSYSTEM-labelled rows — applicants this member
// DECLINED, whose outcomes were observed at another member. That is the whole
// point of the ecosystem: without them the model only ever learns from the
// population the existing policy already approved, and quietly learns to
// reproduce that policy rather than to predict repayment.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { FEATURE_NAMES, FEATURE_SET_VERSION, FEATURES } from "@/lib/features/definitions";
import {
  trainLogistic, trainTrees, predictLogistic, predictTrees,
  type Row, type Logistic, type Trees,
} from "./model";

export type Metrics = {
  auc: number;
  ks: number;
  gini: number;
  n: number;
  bads: number;
  baseRate: number;
  ecosystemRows: number;
};

export type TrainResult = {
  version: string;
  algorithm: string;
  params: Logistic | Trees;
  metrics: Metrics;
  trainRows: number;
  trainStart: Date;
  trainEnd: Date;
  testStart: Date;
  testEnd: Date;
};

/** Missing features become 0 AFTER standardisation would have centred them —
 *  i.e. the training mean — so an unknown reads as "average", not as "zero". */
function vectorise(features: Record<string, unknown>): number[] {
  return FEATURE_NAMES.map((n) => {
    const v = features[n];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  });
}

/** AUC by rank (Mann–Whitney U), which is exact and needs no thresholds. */
export function auc(scores: number[], labels: number[]): number {
  const pairs = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  const pos = labels.filter((y) => y === 1).length;
  const neg = labels.length - pos;
  if (pos === 0 || neg === 0) return 0.5;

  // Average ranks over ties, or tied scores inflate the statistic.
  let i = 0;
  let rankSum = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].s === pairs[i].s) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (pairs[k].y === 1) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** Kolmogorov–Smirnov: the widest gap between the good and bad CDFs. */
export function ks(scores: number[], labels: number[]): number {
  const pairs = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  const pos = labels.filter((y) => y === 1).length || 1;
  const neg = labels.length - labels.filter((y) => y === 1).length || 1;
  let cp = 0;
  let cn = 0;
  let best = 0;
  for (const p of pairs) {
    if (p.y === 1) cp++;
    else cn++;
    best = Math.max(best, Math.abs(cp / pos - cn / neg));
  }
  return best;
}

export async function loadTrainingRows() {
  const decisions = await prisma.decision.findMany({
    where: {
      label: { in: ["REPAID", "DEFAULTED"] },
      featureSetVersion: FEATURE_SET_VERSION,
    },
    orderBy: { at: "asc" },
    select: { at: true, features: true, label: true, labelSource: true },
  });

  return decisions.map((d) => ({
    at: d.at,
    x: vectorise(d.features as Record<string, unknown>),
    y: d.label === "DEFAULTED" ? 1 : 0,
    source: d.labelSource,
  }));
}

export async function train(algorithm: "logistic" | "trees"): Promise<TrainResult> {
  const all = await loadTrainingRows();
  if (all.length < 40) {
    throw new Error(`Only ${all.length} labelled rows. Refusing to train — the metrics would be noise.`);
  }

  // Out-of-time split at the 70th percentile of decision date.
  const cut = Math.floor(all.length * 0.7);
  const trainSet = all.slice(0, cut);
  const testSet = all.slice(cut);

  const rows: Row[] = trainSet.map((r) => ({ x: r.x, y: r.y }));

  // Declared credit sense, translated into sign constraints. y = 1 is DEFAULT,
  // so "increasing risk" means the coefficient may not go negative.
  const monotone = FEATURES.map((f) =>
    f.monotonic === "increasing" ? 1 : f.monotonic === "decreasing" ? -1 : 0,
  );

  const params =
    algorithm === "logistic"
      ? trainLogistic(rows, FEATURE_NAMES, { monotone })
      : trainTrees(rows, FEATURE_NAMES);

  const predict = (x: number[]) =>
    params.kind === "logistic" ? predictLogistic(params, x) : predictTrees(params, x);

  const testScores = testSet.map((r) => predict(r.x));
  const testLabels = testSet.map((r) => r.y);
  const a = auc(testScores, testLabels);

  return {
    version: `${algorithm}-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-4)}`,
    algorithm,
    params,
    metrics: {
      auc: a,
      ks: ks(testScores, testLabels),
      gini: 2 * a - 1,
      n: testSet.length,
      bads: testLabels.filter((y) => y === 1).length,
      baseRate: testLabels.filter((y) => y === 1).length / Math.max(1, testLabels.length),
      ecosystemRows: trainSet.filter((r) => r.source === "ECOSYSTEM").length,
    },
    trainRows: trainSet.length,
    trainStart: trainSet[0].at,
    trainEnd: trainSet[trainSet.length - 1].at,
    testStart: testSet[0].at,
    testEnd: testSet[testSet.length - 1].at,
  };
}

/**
 * Does the model respect the direction credit sense says it should?
 *
 * A model whose "more lenders in the last 14 days" coefficient points the wrong
 * way is not a discovery, it is a bug or a leak. Checking this is cheap and it
 * catches problems that AUC will happily hide.
 */
export function monotonicityViolations(params: Logistic | Trees): string[] {
  if (params.kind !== "logistic") return [];
  const bad: string[] = [];
  FEATURES.forEach((f, j) => {
    if (!f.monotonic) return;
    const w = params.weights[j];
    // y = 1 is DEFAULT, so "increasing" risk means a positive coefficient.
    if (f.monotonic === "increasing" && w < -0.02) bad.push(`${f.name} (expected ↑ risk, got ${w.toFixed(3)})`);
    if (f.monotonic === "decreasing" && w > 0.02) bad.push(`${f.name} (expected ↓ risk, got ${w.toFixed(3)})`);
  });
  return bad;
}
