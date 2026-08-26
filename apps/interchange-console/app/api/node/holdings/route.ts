// ─────────────────────────────────────────────────────────────────────────────
// POST /api/node/holdings — a member node publishes its own book.
//
// This is the endpoint that turned the exposure engine from a demonstration into
// a service. Until it existed, MemberHolding was filled by a seeder with four
// hundred invented borrowers; the fan-out, the Bloom screening and the p95 were
// all real, and every answer they produced was fiction.
//
// What arrives here has ALREADY crossed the tokenisation boundary. The node read
// its own Serviceconnect book, derived a subject_token per borrower through the
// blinded OPRF exchange, and dropped the identifiers. What lands is a token and
// four aggregates — no name, no loan id, no phone number, nothing that could be
// walked back to a person by us or by anybody who compromises us.
//
// ── THREE RULES THIS HANDLER ENFORCES ────────────────────────────────────────
//
//   1. A MEMBER PUBLISHES ONLY ITS OWN BOOK. member_code must equal the signed
//      caller. Otherwise any member could overwrite a competitor's holdings with
//      an empty set and make every borrower look clean — the cheapest possible
//      attack on a credit network, and the most damaging.
//
//   2. TOKENS ONLY. Anything that is not a 128-hex OPRF output is refused with
//      422, loudly. A raw identifier arriving here means a node tokenised too
//      late, and accepting it would quietly break the one guarantee the whole
//      ecosystem is sold on.
//
//   3. GENERATIONS SWAP, THEY DO NOT OVERWRITE. Chunks are written under a new
//      generation and become visible only when `commit` advances
//      Member.holdingGeneration. A fourteen-thousand-row publication takes
//      several requests, and during a delete-then-insert the member would
//      truthfully answer "no exposure" for every borrower they hold.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRequest } from "@/lib/signing";
import { isSubjectToken } from "@/lib/oprf/node";
import { build, saturation, mightContain } from "@/lib/bloom";

/** Target false-positive rate for the published filter. */
const TARGET_FPR = 0.01;

/** The collections ladder a bucket must be a member of. */
const BUCKETS = new Set(["prepayment", "due", "watch_1", "watch_2", "watch_3", "npl"]);

/** Rows per request. Enough that a large book is a handful of calls, not hundreds. */
const MAX_CHUNK = 5_000;

type Wire = {
  subject_token?: unknown;
  active_loans?: unknown;
  outstanding_kes?: unknown;
  worst_bucket?: unknown;
  newest_disbursed_at?: unknown;
};

export async function POST(request: Request) {
  const raw = await request.text();

  const callerCode = request.headers.get("x-interchange-member") ?? "";
  const caller = callerCode
    ? await prisma.member.findUnique({ where: { code: callerCode } })
    : null;

  const verified = verifyRequest({
    method: "POST",
    path: "/api/node/holdings",
    body: raw,
    headers: request.headers,
    publicKeyHex: caller?.publicKey ?? null,
  });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.failure, message: verified.message }, { status: 401 });
  }

  // A suspended member keeps its key but loses the ability to change the network's
  // view of its book — including, deliberately, the ability to empty it.
  if (caller!.status === "SUSPENDED") {
    return NextResponse.json(
      { error: "MEMBER_SUSPENDED", message: "Suspended members cannot publish holdings." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // ── Rule 1: your own book, nobody else's ──────────────────────────────────
  const memberCode = String(body.member_code ?? "");
  if (memberCode !== caller!.code) {
    return NextResponse.json(
      {
        error: "NOT_YOUR_BOOK",
        message:
          "member_code must be the signing member. A member publishes only its own holdings.",
      },
      { status: 403 },
    );
  }

  const generation = Number(body.generation);
  if (!Number.isInteger(generation) || generation < 1) {
    return NextResponse.json({ error: "generation must be a positive integer." }, { status: 400 });
  }
  // Refusing a replay of an already-served generation stops a stale node process
  // resurrecting an old book over a newer one.
  if (generation <= caller!.holdingGeneration) {
    return NextResponse.json(
      {
        error: "STALE_GENERATION",
        message: `Generation ${generation} is not newer than the one being served (${caller!.holdingGeneration}).`,
        serving: caller!.holdingGeneration,
      },
      { status: 409 },
    );
  }

  const incoming = Array.isArray(body.holdings) ? (body.holdings as Wire[]) : null;
  if (!incoming) {
    return NextResponse.json({ error: "holdings must be an array." }, { status: 400 });
  }
  if (incoming.length > MAX_CHUNK) {
    return NextResponse.json(
      { error: "CHUNK_TOO_LARGE", message: `At most ${MAX_CHUNK} holdings per request.`, max: MAX_CHUNK },
      { status: 413 },
    );
  }

  // ── Rule 2: tokens only ───────────────────────────────────────────────────
  const rows: {
    memberId: string;
    subjectToken: string;
    generation: number;
    activeLoans: number;
    outstandingKes: number;
    worstBucket: string;
    newestDisbursedAt: Date | null;
  }[] = [];

  for (let i = 0; i < incoming.length; i++) {
    const h = incoming[i];
    const token = String(h.subject_token ?? "");
    if (!isSubjectToken(token)) {
      return NextResponse.json(
        {
          error: "IDENTIFIER_NOT_TOKENISED",
          message: `holdings[${i}].subject_token is not an OPRF output. Tokenise inside your own node before publishing.`,
        },
        { status: 422 },
      );
    }
    const bucket = String(h.worst_bucket ?? "due");
    if (!BUCKETS.has(bucket)) {
      return NextResponse.json(
        { error: `holdings[${i}].worst_bucket "${bucket}" is not a collections bucket.` },
        { status: 400 },
      );
    }
    const disbursed = h.newest_disbursed_at ? new Date(String(h.newest_disbursed_at)) : null;

    rows.push({
      memberId: caller!.id,
      subjectToken: token.toLowerCase(),
      generation,
      activeLoans: Math.max(0, Math.trunc(Number(h.active_loans ?? 0))),
      outstandingKes: Math.max(0, Math.trunc(Number(h.outstanding_kes ?? 0))),
      worstBucket: bucket,
      newestDisbursedAt: disbursed && !Number.isNaN(disbursed.getTime()) ? disbursed : null,
    });
  }

  // skipDuplicates rather than upsert: within one generation a token appears
  // once, and a retried chunk after a network timeout must not fail the run.
  const written = rows.length
    ? await prisma.memberHolding.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };

  if (!body.commit) {
    return NextResponse.json({
      accepted: written.count,
      generation,
      committed: false,
      serving: caller!.holdingGeneration,
    });
  }

  // ── Rule 3: the swap ──────────────────────────────────────────────────────
  // Build the Bloom filter from what was actually stored, not from what the last
  // chunk contained — the filter must cover the whole generation or the broker
  // will screen out members who really do hold the borrower.
  const staged = await prisma.memberHolding.findMany({
    where: { memberId: caller!.id, generation, activeLoans: { gt: 0 } },
    select: { subjectToken: true },
  });
  const tokens = staged.map((s) => s.subjectToken);
  const { bits, params, itemCount } = build(tokens, TARGET_FPR);

  // ── SELF-CHECK BEFORE THE SWAP ────────────────────────────────────────────
  // A Bloom filter must never report absent for a token it was built from. That
  // guarantee is why this structure was chosen over a cache, and it silently
  // failed for 42% of tokens once — a signed-integer stride sent bit positions
  // negative and out of range, so real lenders were screened out of the fan-out
  // and borrowers came back clean who were not.
  //
  // Refusing the publication is the right failure: the member keeps serving the
  // previous generation, which is stale rather than wrong.
  const unfindable = tokens.filter((t) => !mightContain(bits, params, t));
  if (unfindable.length > 0) {
    return NextResponse.json(
      {
        error: "FILTER_SELF_CHECK_FAILED",
        message:
          `The rebuilt filter reports ${unfindable.length} of ${tokens.length} of its own tokens as absent. ` +
          "Publication refused — committing it would hide real exposure from the network.",
        generation,
      },
      { status: 500 },
    );
  }

  const lastFilter = await prisma.memberFilter.findFirst({
    where: { memberId: caller!.id },
    orderBy: { generation: "desc" },
    select: { generation: true },
  });
  const filterGeneration = (lastFilter?.generation ?? 0) + 1;

  const summary = (body.summary ?? {}) as { borrowers?: unknown; loans?: unknown; lastLoanAt?: unknown };
  const lastLoanAt = summary.lastLoanAt ? new Date(String(summary.lastLoanAt)) : null;

  const previous = caller!.holdingGeneration;

  await prisma.$transaction([
    prisma.memberFilter.create({
      data: {
        memberId: caller!.id,
        generation: filterGeneration,
        bits: new Uint8Array(bits),
        k: params.k,
        m: params.m,
        itemCount,
      },
    }),
    prisma.member.update({
      where: { id: caller!.id },
      data: {
        holdingGeneration: generation,
        holdingsPublishedAt: new Date(),
        // Contribution figures feed the reciprocity check in the policy engine.
        // A member that stops publishing stops being able to query, and this is
        // the timestamp that decides it.
        lastContributionAt: new Date(),
        ...(Number.isFinite(Number(summary.borrowers)) ? { borrowers: Math.trunc(Number(summary.borrowers)) } : {}),
        ...(Number.isFinite(Number(summary.loans)) ? { loans: Math.trunc(Number(summary.loans)) } : {}),
        ...(lastLoanAt && !Number.isNaN(lastLoanAt.getTime()) ? { lastContributionAt: new Date() } : {}),
      },
    }),
  ]);

  // Only now is the old generation unreachable, so dropping it cannot create a
  // window in which this member appears to hold nothing.
  const dropped = previous
    ? await prisma.memberHolding.deleteMany({
        where: { memberId: caller!.id, generation: { lt: generation } },
      })
    : { count: 0 };

  // Keep the last two filter generations: a node mid-download during a rebuild
  // still has a complete previous filter to screen against.
  const keep = await prisma.memberFilter.findMany({
    where: { memberId: caller!.id },
    orderBy: { generation: "desc" },
    take: 2,
    select: { id: true },
  });
  await prisma.memberFilter.deleteMany({
    where: { memberId: caller!.id, id: { notIn: keep.map((k) => k.id) } },
  });

  return NextResponse.json({
    accepted: written.count,
    generation,
    committed: true,
    holdings: staged.length,
    dropped_previous: dropped.count,
    filter: {
      generation: filterGeneration,
      item_count: itemCount,
      m: params.m,
      k: params.k,
      fill: Number(saturation(bits, params.m).toFixed(4)),
    },
  });
}
