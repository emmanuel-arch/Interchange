// ─────────────────────────────────────────────────────────────────────────────
// POST /api/node/exposure — the MEMBER side of an exposure query.
//
// In the deployed architecture this endpoint runs inside each member's
// perimeter, reading their own Serviceconnect book scoped to their EntityID.
// Here it is served by the same app against the MemberHolding stand-in, so the
// real network path — signed request, per-member timeout, aggregates-only
// response — is exercised end to end before nodes ship.
//
// TWO RULES THIS ENDPOINT EXISTS TO ENFORCE:
//
//   1. AGGREGATES ONLY. It returns counts, a band and a bucket. Never a name,
//      never a loan id, never an amount to the shilling. A competitor learns
//      that exposure exists and roughly how much — not who, and not what.
//
//   2. THE MEMBER IS THE SCOPE. `member_code` names WHOSE BOOK to read, and it
//      is not the caller. That is the whole point of a brokered query. But it
//      also means a caller could aim this at any member, so the answer is
//      always scoped to that member's own holdings and never widened.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRequest } from "@/lib/signing";
import { isSubjectToken } from "@/lib/oprf/node";

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

export async function POST(request: Request) {
  const raw = await request.text();

  const callerCode = request.headers.get("x-interchange-member") ?? "";
  const caller = callerCode
    ? await prisma.member.findUnique({ where: { code: callerCode } })
    : null;

  const verified = verifyRequest({
    method: "POST",
    path: "/api/node/exposure",
    body: raw,
    headers: request.headers,
    publicKeyHex: caller?.publicKey ?? null,
  });

  if (!verified.ok) {
    return NextResponse.json({ error: verified.failure, message: verified.message }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const subjectToken = String(body.subject_token ?? "");
  const memberCode = String(body.member_code ?? "");

  if (!isSubjectToken(subjectToken)) {
    return NextResponse.json({ error: "subject_token must be an OPRF output." }, { status: 422 });
  }

  const member = await prisma.member.findUnique({ where: { code: memberCode } });
  if (!member) {
    return NextResponse.json({ error: `Unknown member_code "${memberCode}".` }, { status: 404 });
  }

  // ── "I have not published" is not "they owe me nothing" ───────────────────
  // A member who has never run an ingest holds no rows, and answering
  // has_exposure: false would clear every borrower they actually lend to. The
  // broker counts this as a NON-RESPONSE, which marks the whole result partial —
  // the lender is told the answer is incomplete rather than told a lie.
  if (member.holdingGeneration === 0) {
    return NextResponse.json(
      {
        member_code: member.code,
        error: "BOOK_NOT_PUBLISHED",
        message:
          "This member has not published a book yet. Absence of holdings is not evidence of absence of exposure.",
      },
      { status: 503 },
    );
  }

  const holding = await prisma.memberHolding.findUnique({
    where: {
      memberId_subjectToken_generation: {
        memberId: member.id,
        subjectToken,
        generation: member.holdingGeneration,
      },
    },
  });

  if (!holding || holding.activeLoans === 0) {
    return NextResponse.json({
      member_code: member.code,
      has_exposure: false,
      as_of: member.holdingsPublishedAt,
    });
  }

  return NextResponse.json({
    member_code: member.code,
    has_exposure: true,
    active_loans: holding.activeLoans,
    outstanding_band: band(holding.outstandingKes),
    worst_bucket: holding.worstBucket,
    newest_disbursement: holding.newestDisbursedAt,
    /** When this member's book was last ingested — how stale this answer may be. */
    as_of: member.holdingsPublishedAt,
    // The lender's own name is disclosed only when the borrower consented to it
    // (identity.disclose). The broker decides; the node just reports whether it
    // is permitted to be named.
    disclosable: false,
  });
}
