// ─────────────────────────────────────────────────────────────────────────────
// EXPOSURE, ANSWERED INSIDE THE REGISTRY — for the console's own operators.
//
// The /exposure page used to run only in development, because it worked by
// pretending to be Micromart's NODE: reading a member's private key from a file
// on disk and signing calls to /api/node/exposure as that member. No production
// Registry holds a member's key, and none should.
//
// But in this topology the member "nodes" ARE this application — every member's
// holdings are published into MemberHolding here, and /api/node/exposure reads
// them from this same database. So the console does not need to sign a request
// to itself: it runs the same broker (screen against the published Bloom
// filters → ask only the candidates → aggregate) with the node's answer computed
// in-process. The caller is the operator's member, proved by their session, and
// the gate (lib/consent/gate) still has to grant `exposure-v1` first.
//
// What is unchanged, deliberately: the Bloom screen still decides who is asked,
// the caller is still excluded from its own answer, a member who has never
// published still answers "unpublished" (a non-response, never a clean bill),
// and the answer is still aggregates and bands — never a lender's name unless
// the borrower granted identity.disclose.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { mightContain } from "@/lib/bloom";
import type { ExposureResult, NodeAnswer, PublishedFilter } from "./broker";

/** Outstanding is banded, never exact. An exact figure identifies a loan. */
export function band(kes: number): string {
  if (kes <= 0) return "none";
  if (kes < 10_000) return "<10k";
  if (kes < 25_000) return "10k–25k";
  if (kes < 50_000) return "25k–50k";
  if (kes < 100_000) return "50k–100k";
  if (kes < 250_000) return "100k–250k";
  return "250k+";
}

export type NodeReply =
  | { ok: true; answer: NodeAnswer; asOf: Date | null }
  | { ok: false; reason: "unpublished" | "unknown" };

/**
 * One member's answer about one subject — what /api/node/exposure returns,
 * as a function both it and the console call.
 */
export async function nodeAnswer(memberCode: string, subjectToken: string): Promise<NodeReply> {
  const member = await prisma.member.findUnique({ where: { code: memberCode } });
  if (!member) return { ok: false, reason: "unknown" };
  // "I have not published" is not "they owe me nothing".
  if (member.holdingGeneration === 0) return { ok: false, reason: "unpublished" };

  const holding = await prisma.memberHolding.findUnique({
    where: {
      memberId_subjectToken_generation: { memberId: member.id, subjectToken, generation: member.holdingGeneration },
    },
  });
  if (!holding || holding.activeLoans === 0) {
    return { ok: true, answer: { memberCode: member.code, hasExposure: false }, asOf: member.holdingsPublishedAt };
  }
  return {
    ok: true,
    asOf: member.holdingsPublishedAt,
    answer: {
      memberCode: member.code,
      hasExposure: true,
      activeLoans: holding.activeLoans,
      outstandingBand: band(holding.outstandingKes),
      worstBucket: holding.worstBucket,
      newestDisbursement: holding.newestDisbursedAt ? holding.newestDisbursedAt.toISOString() : null,
    },
  };
}

/** The newest published filter per member, as /api/filters serves them. */
export async function publishedFilters(): Promise<PublishedFilter[]> {
  const filters = await prisma.memberFilter.findMany({ orderBy: { generation: "desc" } });
  const latest = new Map<string, (typeof filters)[number]>();
  for (const f of filters) if (!latest.has(f.memberId)) latest.set(f.memberId, f);
  const members = await prisma.member.findMany({ where: { id: { in: [...latest.keys()] } }, select: { id: true, code: true } });
  const codeById = new Map(members.map((m) => [m.id, m.code]));
  return [...latest.values()]
    .filter((f) => codeById.has(f.memberId))
    .map((f) => ({
      member_code: codeById.get(f.memberId)!,
      generation: f.generation,
      m: f.m,
      k: f.k,
      item_count: f.itemCount,
      bits: Buffer.from(f.bits).toString("base64"),
    }));
}

const BUCKET_ORDER = ["prepayment", "due", "watch_1", "watch_2", "watch_3", "npl"];
const BAND_MIDPOINT: Record<string, number> = {
  none: 0, "<10k": 5_000, "10k–25k": 17_500, "25k–50k": 37_500, "50k–100k": 75_000, "100k–250k": 175_000, "250k+": 350_000,
};

/**
 * The whole query, for one caller and one subject token. Mirrors
 * queryExposure() in ./broker.ts step for step, with the node answered locally.
 */
export async function localExposure(callerCode: string, subjectToken: string, ownBooks: string[] = [callerCode]): Promise<ExposureResult> {
  const t0 = Date.now();
  const [filters, members] = await Promise.all([
    publishedFilters(),
    prisma.member.findMany({ where: { status: { in: ["ACTIVE", "SHADOW"] } }, select: { code: true, name: true } }),
  ]);
  // The caller is excluded from its own answer — and so are its sibling books
  // (Axe runs Boresha and Stawi, Micromart runs Fintech and Africa): a lender
  // already knows its own book, and counting it would report the lender to
  // itself as "another lender".
  const own = new Set([callerCode, ...ownBooks]);
  const askable = members.map((m) => m.code).filter((c) => !own.has(c));

  // Screen: a member with no filter is always asked — absence of a filter is
  // not evidence of absence of exposure.
  const byCode = new Map(filters.map((f) => [f.member_code, f]));
  const candidates = askable.filter((code) => {
    const f = byCode.get(code);
    if (!f) return true;
    return mightContain(Buffer.from(f.bits, "base64"), { m: f.m, k: f.k }, subjectToken);
  });
  const screenMs = Date.now() - t0;

  const t1 = Date.now();
  const replies = await Promise.all(candidates.map(async (code) => ({ code, r: await nodeAnswer(code, subjectToken) })));
  const fanoutMs = Date.now() - t1;

  const responded = replies.filter((x) => x.r.ok).map((x) => (x.r as { ok: true; answer: NodeAnswer }).answer);
  const silent = replies
    .filter((x) => !x.r.ok)
    .map((x) => ({ memberCode: x.code, reason: (x.r as { ok: false; reason: string }).reason === "unpublished" ? ("unpublished" as const) : ("error" as const) }));
  const withExposure = responded.filter((a) => a.hasExposure);

  const newest = withExposure.map((a) => a.newestDisbursement).filter((d): d is string => !!d).sort().pop() ?? null;
  const fourteenDaysAgo = Date.now() - 14 * 86_400_000;
  const total = withExposure.reduce((s, a) => s + (BAND_MIDPOINT[a.outstandingBand ?? "none"] ?? 0), 0);
  let worst = "due";
  let rank = -1;
  for (const a of withExposure) {
    const i = BUCKET_ORDER.indexOf(a.worstBucket ?? "due");
    if (i > rank) {
      rank = i;
      worst = a.worstBucket ?? "due";
    }
  }

  return {
    subjectToken,
    asOf: new Date().toISOString(),
    activeLoans: withExposure.reduce((s, a) => s + (a.activeLoans ?? 0), 0),
    lenders: withExposure.length,
    outstandingBand: band(total),
    worstBucket: worst,
    newestDisbursement: newest,
    velocity14d: withExposure.filter((a) => a.newestDisbursement && Date.parse(a.newestDisbursement) >= fourteenDaysAgo).length,
    partial: silent.length > 0,
    screened: askable.length,
    queried: candidates.length,
    responded: responded.length,
    silent,
    // Names only with identity.disclose — the console never has it, so never.
    lendersNamed: null,
    timings: { screenMs, fanoutMs, totalMs: Date.now() - t0 },
  };
}
