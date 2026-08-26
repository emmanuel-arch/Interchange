// POST /api/oprf/evaluate — the token service.
//
// A member sends a blinded element; this returns it evaluated under the
// ecosystem key. The Registry cannot learn the identifier, and the member cannot
// learn the key.
//
// Signed, because issuance is rate-limited per member and an unauthenticated
// caller could exhaust someone else's quota — or, worse, use the ecosystem key
// as a free tokenisation oracle to enumerate identities from outside.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRequest } from "@/lib/signing";
import {
  blindEvaluate,
  assertIssuanceWithinLimit,
  IssuanceLimitExceeded,
  type IssuanceKind,
} from "@/lib/oprf/registry";

export async function POST(request: Request) {
  const raw = await request.text();

  const memberCode = request.headers.get("x-interchange-member") ?? "";
  const member = memberCode
    ? await prisma.member.findUnique({ where: { code: memberCode } })
    : null;

  const verified = verifyRequest({
    method: "POST",
    path: "/api/oprf/evaluate",
    body: raw,
    headers: request.headers,
    publicKeyHex: member?.publicKey ?? null,
  });

  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.failure, message: verified.message },
      { status: 401 },
    );
  }

  // Suspended members keep their key but lose the service — otherwise a member
  // removed for cause could still mint tokens for the rest of the ecosystem.
  if (member!.status === "SUSPENDED") {
    return NextResponse.json(
      { error: "MEMBER_SUSPENDED", message: "Suspended members cannot mint tokens." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // One element or many. A node ingesting its own book has thousands of
  // borrowers to tokenise, and one HTTP round trip each turns a ten-second job
  // into a ten-minute one — so the batch form exists. It is metered by ELEMENT,
  // not by request, so batching buys speed and never allowance.
  const batched = Array.isArray(body.blinded);
  const blindedList: string[] = batched
    ? (body.blinded as unknown[]).map(String)
    : [String(body.blinded ?? "")];

  if (blindedList.length === 0) {
    return NextResponse.json({ error: "blinded must not be empty." }, { status: 400 });
  }
  if (blindedList.length > MAX_BATCH) {
    return NextResponse.json(
      { error: "BATCH_TOO_LARGE", message: `At most ${MAX_BATCH} elements per request.`, max: MAX_BATCH },
      { status: 413 },
    );
  }
  const malformed = blindedList.findIndex((b) => !/^[0-9a-f]{64}$/i.test(b));
  if (malformed >= 0) {
    return NextResponse.json(
      {
        error: `blinded[${malformed}] must be a 64-character hex ristretto255 point.`,
      },
      { status: 400 },
    );
  }

  // INGEST is a separate allowance from SERVING — see lib/oprf/registry.ts. It
  // is asked for explicitly so the audit records which allowance was spent; a
  // member cannot obtain it by simply sending a large batch.
  const kind: IssuanceKind = body.purpose === "ingest" ? "INGEST" : "SERVING";

  let quota: { used: number; limit: number; kind: IssuanceKind };
  try {
    quota = await assertIssuanceWithinLimit(member!.id, blindedList.length, kind);
  } catch (e) {
    if (e instanceof IssuanceLimitExceeded) {
      return NextResponse.json(
        {
          error: "ISSUANCE_LIMIT",
          message:
            `Daily ${e.kind.toLowerCase()} token issuance limit reached. This cap is what stops ` +
            "the ecosystem key being used to enumerate the national ID space.",
          limit: e.limit,
          kind: e.kind,
        },
        { status: 429 },
      );
    }
    throw e;
  }

  try {
    const evaluated = blindedList.map(blindEvaluate);
    return NextResponse.json({
      // Shape mirrors the request: one in, one out; many in, many out. A caller
      // that sent a scalar should not have to unwrap an array it did not ask for.
      evaluated: batched ? evaluated : evaluated[0],
      issuance: quota,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "OPRF_FAILED", message: (e as Error).message },
      { status: 500 },
    );
  }
}

/**
 * Ceiling on one batch.
 *
 * Not a security control — the issuance cap is that. This bounds the CPU one
 * request can occupy: each element is a ristretto255 scalar multiplication, and
 * Next serves this on the same event loop as every live exposure query. Ten
 * thousand of them in one request would stall the p95 the whole product is
 * measured on.
 */
const MAX_BATCH = 2_000;
