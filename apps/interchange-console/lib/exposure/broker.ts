// ─────────────────────────────────────────────────────────────────────────────
// The exposure broker.
//
// Screen → fan out → aggregate, with a hard latency budget.
//
// The design decisions worth knowing:
//
// · BLOOM FIRST. Members whose filter says "definitely not" are never contacted,
//   so they never learn the query happened. This is a privacy control before it
//   is a performance one — see lib/bloom.ts.
//
// · PARALLEL, WITH PER-MEMBER TIMEOUTS. One slow member must not blow the whole
//   budget. Each node gets NODE_TIMEOUT_MS; whoever misses it is reported as a
//   non-responder rather than failing the query.
//
// · DEGRADE, NEVER LIE. If a member times out, the result is marked
//   `partial: true` with the responder count. A lender making a credit decision
//   needs to know the answer is incomplete — silently returning "no exposure
//   found" when a node was unreachable is the single most dangerous thing this
//   service could do.
//
// · AGGREGATES ONLY. Lender identities are withheld unless the borrower granted
//   identity.disclose, and outstanding is banded rather than exact.
// ─────────────────────────────────────────────────────────────────────────────
import { mightContain } from "@/lib/bloom";
import { signRequest } from "@/lib/signing";

/** Per-member budget. The whole query targets p95 under 400ms. */
export const NODE_TIMEOUT_MS = 250;

export type NodeAnswer = {
  memberCode: string;
  hasExposure: boolean;
  activeLoans?: number;
  outstandingBand?: string;
  worstBucket?: string;
  newestDisbursement?: string | null;
};

export type ExposureResult = {
  subjectToken: string;
  asOf: string;
  activeLoans: number;
  lenders: number;
  outstandingBand: string;
  worstBucket: string;
  newestDisbursement: string | null;
  velocity14d: number;
  partial: boolean;
  screened: number;
  queried: number;
  responded: number;
  lendersNamed: string[] | null;
  timings: { screenMs: number; fanoutMs: number; totalMs: number };
};

/** Collections taxonomy, worst last — matches CollectBox LoanCategories. */
const BUCKET_ORDER = ["prepayment", "due", "watch_1", "watch_2", "watch_3", "npl"];

function worstOf(buckets: string[]): string {
  let worst = "due";
  let rank = -1;
  for (const b of buckets) {
    const i = BUCKET_ORDER.indexOf(b);
    if (i > rank) {
      rank = i;
      worst = b;
    }
  }
  return worst;
}

/** Re-band the ecosystem total. Bands are not additive, so sum the midpoints. */
const BAND_MIDPOINT: Record<string, number> = {
  none: 0,
  "<10k": 5_000,
  "10k–25k": 17_500,
  "25k–50k": 37_500,
  "50k–100k": 75_000,
  "100k–250k": 175_000,
  "250k+": 350_000,
};

function bandTotal(bands: string[]): string {
  const total = bands.reduce((a, b) => a + (BAND_MIDPOINT[b] ?? 0), 0);
  if (total <= 0) return "none";
  if (total < 10_000) return "<10k";
  if (total < 25_000) return "10k–25k";
  if (total < 50_000) return "25k–50k";
  if (total < 100_000) return "50k–100k";
  if (total < 250_000) return "100k–250k";
  return "250k+";
}

export type PublishedFilter = {
  member_code: string;
  generation: number;
  m: number;
  k: number;
  item_count: number;
  bits: string; // base64
};

/** Download the published filter set. A node does this every 15 minutes. */
export async function fetchFilters(baseUrl: string): Promise<PublishedFilter[]> {
  const res = await fetch(`${baseUrl}/api/filters`);
  if (!res.ok) throw new Error(`Could not fetch filters: ${res.status}`);
  const j = (await res.json()) as { filters: PublishedFilter[] };
  return j.filters;
}

/**
 * Which members might hold this borrower?
 *
 * Screening happens HERE, inside the calling node, against filters downloaded
 * earlier — so no third party learns which token is being evaluated.
 *
 * A member with NO published filter is always queried. Absence of a filter is
 * not evidence of absence of exposure, and quietly skipping them would produce
 * exactly the false negative this design refuses to allow.
 */
export function screen(
  subjectToken: string,
  allMemberCodes: string[],
  filters: PublishedFilter[],
): string[] {
  const byCode = new Map(filters.map((f) => [f.member_code, f]));
  const candidates: string[] = [];

  for (const code of allMemberCodes) {
    const f = byCode.get(code);
    if (!f) {
      candidates.push(code);
      continue;
    }
    const bits = Buffer.from(f.bits, "base64");
    if (mightContain(bits, { m: f.m, k: f.k }, subjectToken)) candidates.push(code);
  }

  return candidates;
}

async function askNode(
  baseUrl: string,
  callerCode: string,
  callerSecretKey: string,
  memberCode: string,
  subjectToken: string,
): Promise<NodeAnswer | null> {
  const path = "/api/node/exposure";
  const body = JSON.stringify({ subject_token: subjectToken, member_code: memberCode });
  const headers = signRequest({ method: "POST", path, body, memberCode: callerCode, secretKeyHex: callerSecretKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NODE_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    return {
      memberCode: String(j.member_code),
      hasExposure: Boolean(j.has_exposure),
      activeLoans: j.active_loans as number | undefined,
      outstandingBand: j.outstanding_band as string | undefined,
      worstBucket: j.worst_bucket as string | undefined,
      newestDisbursement: (j.newest_disbursement as string | null) ?? null,
    };
  } catch {
    // Timeout or transport failure. Deliberately null rather than throwing —
    // one unreachable member degrades the answer, it does not fail it.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function queryExposure(opts: {
  baseUrl: string;
  callerCode: string;
  callerSecretKey: string;
  /** Every member that could be asked. The caller excludes itself. */
  memberCodes: string[];
  filters: PublishedFilter[];
  subjectToken: string;
  discloseLenders: boolean;
}): Promise<ExposureResult> {
  const t0 = Date.now();

  // The caller is excluded: they already know their own book, and including it
  // would double-count their exposure in the ecosystem total.
  const askable = opts.memberCodes.filter((c) => c !== opts.callerCode);
  const candidates = screen(opts.subjectToken, askable, opts.filters);
  const screenMs = Date.now() - t0;

  const t1 = Date.now();
  const answers = await Promise.all(
    candidates.map((code) =>
      askNode(opts.baseUrl, opts.callerCode, opts.callerSecretKey, code, opts.subjectToken),
    ),
  );
  const fanoutMs = Date.now() - t1;

  const responded = answers.filter((a): a is NodeAnswer => a !== null);
  const withExposure = responded.filter((a) => a.hasExposure);

  const newest = withExposure
    .map((a) => a.newestDisbursement)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? null;

  const fourteenDaysAgo = Date.now() - 14 * 86_400_000;
  const velocity14d = withExposure.filter(
    (a) => a.newestDisbursement && Date.parse(a.newestDisbursement) >= fourteenDaysAgo,
  ).length;

  return {
    subjectToken: opts.subjectToken,
    asOf: new Date().toISOString(),
    activeLoans: withExposure.reduce((a, x) => a + (x.activeLoans ?? 0), 0),
    lenders: withExposure.length,
    outstandingBand: bandTotal(withExposure.map((a) => a.outstandingBand ?? "none")),
    worstBucket: worstOf(withExposure.map((a) => a.worstBucket ?? "due")),
    newestDisbursement: newest,
    velocity14d,
    partial: responded.length < candidates.length,
    screened: askable.length,
    queried: candidates.length,
    responded: responded.length,
    lendersNamed: opts.discloseLenders ? withExposure.map((a) => a.memberCode) : null,
    timings: { screenMs, fanoutMs, totalMs: Date.now() - t0 },
  };
}
