// ─────────────────────────────────────────────────────────────────────────────
// POST /api/exchange — a signed, consented, logged call between members.
//
// This is the Sprint 2 acceptance criterion in one endpoint. Four things happen,
// in this order, and every one of them can refuse:
//
//   1. VERIFY   the caller's Ed25519 signature. Identity is proved, not claimed.
//   2. AUTHORISE via the gate: reciprocity, quota, consent, scope.
//   3. LOG      into the hash-chained message log, granted or refused.
//   4. SIGN     the response, so the caller can prove what they were told.
//
// The message log entry is written for REFUSALS too. A member needs to be able
// to prove they were turned away just as much as they need to prove they asked —
// otherwise "the Registry refused me" is unfalsifiable.
//
// This endpoint does not yet fan out to other members' nodes; that is the
// exposure engine in Sprint 3. What it proves today is that the envelope,
// identity, policy and log are sound enough to carry one.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { authorise } from "@/lib/consent/gate";
import { verifyRequest } from "@/lib/signing";
import { append } from "@/lib/messagelog";
import { isSubjectToken } from "@/lib/oprf/node";

export async function POST(request: Request) {
  const started = Date.now();
  const raw = await request.text();

  // ── 1. Identity ───────────────────────────────────────────────────────────
  const memberCode = request.headers.get("x-interchange-member") ?? "";
  const caller = memberCode
    ? await prisma.member.findUnique({ where: { code: memberCode } })
    : null;

  const verified = verifyRequest({
    method: "POST",
    path: "/api/exchange",
    body: raw,
    headers: request.headers,
    publicKeyHex: caller?.publicKey ?? null,
  });

  if (!verified.ok) {
    // Deliberately NOT logged to the message chain: an unverified caller has no
    // established identity, so an entry attributing this to a member code would
    // be a claim we cannot stand behind. Anyone can send a header.
    return NextResponse.json(
      { error: verified.failure, message: verified.message },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const serviceCode = String(body.service_code ?? "");
  const subjectToken = String(body.subject_token ?? "");
  const consentRef = body.consent_ref ? String(body.consent_ref) : null;

  if (!serviceCode || !subjectToken) {
    return NextResponse.json(
      { error: "service_code and subject_token are required." },
      { status: 400 },
    );
  }

  if (!isSubjectToken(subjectToken)) {
    return NextResponse.json(
      {
        error: "IDENTIFIER_NOT_TOKENISED",
        message:
          "subject_token is not an OPRF output. Derive it through /api/oprf/evaluate inside your own node.",
      },
      { status: 422 },
    );
  }

  const service = await prisma.service.findUnique({ where: { code: serviceCode } });
  if (!service) {
    return NextResponse.json({ error: `Unknown service_code "${serviceCode}".` }, { status: 404 });
  }

  // ── 2. Policy ─────────────────────────────────────────────────────────────
  const decision = await authorise({
    callerId: caller!.id,
    serviceCode,
    subjectToken,
    consentRef,
  });

  const latencyMs = Date.now() - started;
  await prisma.auditEntry.update({ where: { id: decision.auditId }, data: { latencyMs } });

  const responseBody = decision.ok
    ? {
        authorised: true as const,
        service: serviceCode,
        // Sprint 3 replaces this with the real fan-out result.
        result: { pending_exposure_engine: true },
        audit_id: decision.auditId,
        latency_ms: latencyMs,
      }
    : {
        authorised: false as const,
        outcome: decision.outcome,
        reason: decision.reason,
        audit_id: decision.auditId,
        latency_ms: latencyMs,
      };

  const responseJson = JSON.stringify(responseBody);
  const responseDigest = createHash("sha256").update(responseJson, "utf8").digest("hex");

  // ── 3. Message log ────────────────────────────────────────────────────────
  const entry = await append({
    callerCode: caller!.code,
    serviceCode,
    subjectToken,
    consentRef,
    outcome: decision.ok ? "GRANTED" : decision.outcome,
    requestDigest: verified.digest,
    responseDigest,
    callerSignature: verified.signature,
  });

  // ── 4. Receipt ────────────────────────────────────────────────────────────
  // The chain position and hash go back to the caller so they hold a receipt
  // they can check against the Registry later, rather than having to trust that
  // we recorded it.
  return NextResponse.json(responseBody, {
    status: decision.ok ? 200 : 403,
    headers: {
      "x-interchange-log-seq": entry.seq.toString(),
      "x-interchange-log-hash": entry.hash,
      "x-interchange-response-digest": responseDigest,
    },
  });
}
