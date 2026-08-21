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

  const blinded = String(body.blinded ?? "");
  if (!/^[0-9a-f]{64}$/i.test(blinded)) {
    return NextResponse.json(
      { error: "blinded must be a 64-character hex ristretto255 point." },
      { status: 400 },
    );
  }

  let quota: { used: number; limit: number };
  try {
    quota = await assertIssuanceWithinLimit(member!.id);
  } catch (e) {
    if (e instanceof IssuanceLimitExceeded) {
      return NextResponse.json(
        {
          error: "ISSUANCE_LIMIT",
          message:
            "Daily token issuance limit reached. This cap is what stops the ecosystem " +
            "key being used to enumerate the national ID space.",
          limit: e.limit,
        },
        { status: 429 },
      );
    }
    throw e;
  }

  try {
    return NextResponse.json({
      evaluated: blindEvaluate(blinded),
      issuance: quota,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "OPRF_FAILED", message: (e as Error).message },
      { status: 500 },
    );
  }
}
