// ─────────────────────────────────────────────────────────────────────────────
// Population Stability Index.
//
// PSI compares the distribution of a feature between a reference period and a
// recent one. It is how you find out that a member changed their onboarding
// form, or started lending to a different segment, BEFORE the score quietly
// stops meaning what it used to.
//
// Conventional reading:
//   < 0.10  stable
//   < 0.25  moderate shift — worth investigating
//   ≥ 0.25  significant shift — the model is scoring a population it was not
//           trained on
//
// A drifting INPUT is detectable immediately. A drifting model is only
// detectable once the loans go bad, which is months later and expensive. That
// asymmetry is the entire argument for monitoring inputs.
// ─────────────────────────────────────────────────────────────────────────────

/** Small floor so an empty bucket does not send the log to infinity. */
const EPSILON = 1e-6;

/**
 * PSI over `bins` quantile buckets of the reference sample.
 *
 * Quantile edges come from the REFERENCE distribution, not the combined one —
 * using the combined sample would let the thing being measured move the ruler.
 */
export function psi(reference: number[], recent: number[], bins = 10): number {
  const ref = reference.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const cur = recent.filter((v) => Number.isFinite(v));
  if (ref.length === 0 || cur.length === 0) return 0;

  const edges: number[] = [];
  for (let i = 1; i < bins; i++) {
    edges.push(ref[Math.floor((i / bins) * ref.length)]);
  }
  const uniqueEdges = [...new Set(edges)];
  // A feature with fewer distinct values than bins (a count, a flag) collapses
  // to however many buckets it actually has, rather than reporting false drift
  // from empty ones.
  if (uniqueEdges.length === 0) return 0;

  const bucket = (v: number) => {
    let i = 0;
    while (i < uniqueEdges.length && v > uniqueEdges[i]) i++;
    return i;
  };

  const n = uniqueEdges.length + 1;
  const refCounts = new Array(n).fill(0);
  const curCounts = new Array(n).fill(0);
  for (const v of ref) refCounts[bucket(v)]++;
  for (const v of cur) curCounts[bucket(v)]++;

  let total = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.max(refCounts[i] / ref.length, EPSILON);
    const q = Math.max(curCounts[i] / cur.length, EPSILON);
    total += (q - p) * Math.log(q / p);
  }
  return total;
}

export function interpret(value: number): "stable" | "moderate" | "significant" {
  if (value < 0.1) return "stable";
  if (value < 0.25) return "moderate";
  return "significant";
}
