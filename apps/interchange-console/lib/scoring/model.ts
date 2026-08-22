// ─────────────────────────────────────────────────────────────────────────────
// The models.
//
// TWO, DELIBERATELY, AND THE SIMPLER ONE IS THE CHAMPION.
//
// A logistic scorecard is the classical credit-scoring model, and it is the
// right default here for reasons that are not nostalgia: its contributions are
// EXACT rather than approximated, its monotonicity can be inspected by reading
// a coefficient, and it degrades gracefully on the small samples a young
// ecosystem actually has. With 212 labelled rows a gradient-boosted ensemble
// will memorise, and the backtest will look better while the model gets worse.
//
// The tree ensemble is the CHALLENGER. It earns promotion by beating the
// champion on a held-out window — not by being newer or more fashionable.
//
// Both are implemented here rather than pulled in because the training set is
// small, the feature count is 18, and a dependency that must be installed in
// every member's node is a real cost. If this grows to millions of rows the
// answer is to export to LightGBM, not to scale this file.
// ─────────────────────────────────────────────────────────────────────────────

export type Row = { x: number[]; y: number };

// ── Standardisation ─────────────────────────────────────────────────────────
// Kept WITH the model. Standardising with statistics recomputed at serving time
// is a classic skew bug: the same borrower scores differently depending on who
// else applied today.

export type Scaler = { mean: number[]; sd: number[] };

export function fitScaler(rows: Row[]): Scaler {
  const n = rows.length;
  const d = rows[0].x.length;
  const mean = new Array(d).fill(0);
  const sd = new Array(d).fill(0);

  for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r.x[j] / n;
  for (const r of rows) for (let j = 0; j < d; j++) sd[j] += (r.x[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1; // constant column ⇒ 1, not 0

  return { mean, sd };
}

export const applyScaler = (s: Scaler, x: number[]) =>
  x.map((v, j) => (v - s.mean[j]) / s.sd[j]);

// ── Logistic regression ─────────────────────────────────────────────────────

export type Logistic = {
  kind: "logistic";
  weights: number[];
  bias: number;
  scaler: Scaler;
  featureNames: string[];
};

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

/**
 * Train a logistic scorecard, optionally with MONOTONIC CONSTRAINTS.
 *
 * `monotone[j]` is +1 if the feature may only raise risk, -1 if it may only
 * lower it, 0 if unconstrained. After each gradient step the coefficient is
 * projected back onto the allowed half-line — plain projected gradient descent.
 *
 * This is not cosmetic. The ecosystem features are near-duplicates of one
 * another (active lenders, active loans and outstanding balance move together
 * with correlation well above 0.9), and on a few hundred rows collinearity
 * flips coefficient signs freely: an unconstrained fit here put a NEGATIVE
 * weight on worst-days-past-due while defaulters demonstrably had higher DPD
 * than repayers. The fit was reallocating weight between correlated columns,
 * and the result was a model that would have told a borrower their arrears
 * history helped them.
 *
 * Constraining the sign is standard practice in credit scorecards for exactly
 * this reason: it costs a little in-sample fit, buys stability, and makes the
 * reason codes defensible to the person being declined.
 */
export function trainLogistic(
  rows: Row[],
  featureNames: string[],
  opts: { epochs?: number; lr?: number; l2?: number; monotone?: number[] } = {},
): Logistic {
  const { epochs = 3000, lr = 0.1, l2 = 0.05, monotone } = opts;
  const scaler = fitScaler(rows);
  const scaled = rows.map((r) => ({ x: applyScaler(scaler, r.x), y: r.y }));
  const d = featureNames.length;

  let weights = new Array(d).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (const r of scaled) {
      const p = sigmoid(r.x.reduce((a, v, j) => a + v * weights[j], bias));
      const err = p - r.y;
      for (let j = 0; j < d; j++) gw[j] += (err * r.x[j]) / scaled.length;
      gb += err / scaled.length;
    }
    // L2 on the weights only. Penalising the bias would drag the model away
    // from the base rate, which is the one thing it should get right for free.
    for (let j = 0; j < d; j++) {
      weights[j] -= lr * (gw[j] + l2 * weights[j]);
      // Project onto the allowed half-line. y = 1 is DEFAULT, so a feature that
      // may only raise risk must keep a non-negative coefficient.
      if (monotone) {
        if (monotone[j] > 0 && weights[j] < 0) weights[j] = 0;
        if (monotone[j] < 0 && weights[j] > 0) weights[j] = 0;
      }
    }
    bias -= lr * gb;
  }

  return { kind: "logistic", weights, bias, scaler, featureNames };
}

export function predictLogistic(m: Logistic, x: number[]): number {
  const z = applyScaler(m.scaler, x).reduce((a, v, j) => a + v * m.weights[j], m.bias);
  return sigmoid(z);
}

/**
 * EXACT per-feature contributions to the log-odds.
 *
 * For a linear model this is not an approximation of SHAP — it IS the Shapley
 * value, because the model is additive. Contributions are measured against the
 * training mean, so "this borrower's velocity pushed them 0.４ log-odds worse
 * than an average applicant" is literally true rather than a rationalisation.
 */
export function contributionsLogistic(m: Logistic, x: number[]) {
  const scaled = applyScaler(m.scaler, x);
  return m.featureNames.map((name, j) => ({ name, contribution: scaled[j] * m.weights[j] }));
}

// ── Gradient-boosted trees ──────────────────────────────────────────────────

type Node =
  | { leaf: true; value: number }
  | { leaf: false; feature: number; threshold: number; left: Node; right: Node };

export type Trees = {
  kind: "trees";
  base: number;
  lr: number;
  trees: Node[];
  featureNames: string[];
};

function buildTree(rows: Row[], grad: number[], depth: number, minLeaf: number): Node {
  const mean = grad.reduce((a, g) => a + g, 0) / grad.length;
  if (depth === 0 || rows.length < minLeaf * 2) return { leaf: true, value: mean };

  let best: { feature: number; threshold: number; gain: number } | null = null;
  const d = rows[0].x.length;

  for (let j = 0; j < d; j++) {
    const values = [...new Set(rows.map((r) => r.x[j]))].sort((a, b) => a - b);
    if (values.length < 2) continue;
    // Candidate thresholds at quantiles rather than every value — with this
    // little data, splitting on every distinct value is how you overfit.
    for (let q = 1; q < Math.min(values.length, 8); q++) {
      const t = values[Math.floor((q / Math.min(values.length, 8)) * values.length)];
      const li: number[] = [];
      const ri: number[] = [];
      rows.forEach((r, i) => (r.x[j] <= t ? li : ri).push(i));
      if (li.length < minLeaf || ri.length < minLeaf) continue;

      const lm = li.reduce((a, i) => a + grad[i], 0) / li.length;
      const rm = ri.reduce((a, i) => a + grad[i], 0) / ri.length;
      const sse =
        li.reduce((a, i) => a + (grad[i] - lm) ** 2, 0) +
        ri.reduce((a, i) => a + (grad[i] - rm) ** 2, 0);
      const total = grad.reduce((a, g) => a + (g - mean) ** 2, 0);
      const gain = total - sse;
      if (!best || gain > best.gain) best = { feature: j, threshold: t, gain };
    }
  }

  if (!best || best.gain <= 0) return { leaf: true, value: mean };

  const li: number[] = [];
  const ri: number[] = [];
  rows.forEach((r, i) => (r.x[best!.feature] <= best!.threshold ? li : ri).push(i));

  return {
    leaf: false,
    feature: best.feature,
    threshold: best.threshold,
    left: buildTree(li.map((i) => rows[i]), li.map((i) => grad[i]), depth - 1, minLeaf),
    right: buildTree(ri.map((i) => rows[i]), ri.map((i) => grad[i]), depth - 1, minLeaf),
  };
}

const evalTree = (n: Node, x: number[]): number =>
  n.leaf ? n.value : evalTree(x[n.feature] <= n.threshold ? n.left : n.right, x);

export function trainTrees(
  rows: Row[],
  featureNames: string[],
  opts: { rounds?: number; depth?: number; lr?: number; minLeaf?: number } = {},
): Trees {
  const { rounds = 40, depth = 3, lr = 0.1, minLeaf = 8 } = opts;
  const base = Math.log(
    Math.max(1e-6, rows.filter((r) => r.y === 1).length) /
      Math.max(1e-6, rows.filter((r) => r.y === 0).length),
  );

  const trees: Node[] = [];
  const scores = rows.map(() => base);

  for (let t = 0; t < rounds; t++) {
    // Negative gradient of log-loss = residual on the probability scale.
    const grad = rows.map((r, i) => r.y - sigmoid(scores[i]));
    const tree = buildTree(rows, grad, depth, minLeaf);
    trees.push(tree);
    rows.forEach((r, i) => (scores[i] += lr * evalTree(tree, r.x)));
  }

  return { kind: "trees", base, lr, trees, featureNames };
}

export function predictTrees(m: Trees, x: number[]): number {
  return sigmoid(m.trees.reduce((a, t) => a + m.lr * evalTree(t, x), m.base));
}

/**
 * Per-feature contributions by path decomposition (Saabas).
 *
 * Honest limitation: this is NOT TreeSHAP. It attributes each split's change in
 * leaf value to the splitting feature, which is exact for the path taken but is
 * order-dependent across correlated features. It is fine for ranking reason
 * codes and it is not fine for a regulatory filing. That is one of several
 * reasons the logistic model is the champion.
 */
export function contributionsTrees(m: Trees, x: number[]) {
  const acc = new Array(m.featureNames.length).fill(0);

  for (const tree of m.trees) {
    let node = tree;
    let prev = node.leaf ? node.value : subtreeMean(node);
    while (!node.leaf) {
      const next = x[node.feature] <= node.threshold ? node.left : node.right;
      const nextVal = next.leaf ? next.value : subtreeMean(next);
      acc[node.feature] += m.lr * (nextVal - prev);
      prev = nextVal;
      node = next;
    }
  }

  return m.featureNames.map((name, j) => ({ name, contribution: acc[j] }));
}

function subtreeMean(n: Node): number {
  if (n.leaf) return n.value;
  return (subtreeMean(n.left) + subtreeMean(n.right)) / 2;
}

// ── Scaling to a score ──────────────────────────────────────────────────────

/**
 * Probability of default → a 300–850 score, higher is better.
 *
 * The familiar range is not decoration: lenders already have policy thresholds
 * in their heads on this scale, and handing them a probability guarantees
 * somebody multiplies it by 1000 and treats it as a score anyway.
 */
export function toScore(pd: number): number {
  const clamped = Math.min(0.999, Math.max(0.001, pd));
  const odds = (1 - clamped) / clamped;
  const raw = 600 + (40 / Math.LN2) * Math.log(odds / 19);
  return Math.round(Math.min(850, Math.max(300, raw)));
}
