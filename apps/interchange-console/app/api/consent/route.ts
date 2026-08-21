// ─────────────────────────────────────────────────────────────────────────────
// POST /api/consent — issue a consent_ref.
//
// This is the endpoint a BRIDGED member calls from their own onboarding. It is
// deliberately the first thing a new member integrates: the network's currency
// is provable consent, and making them build this before they can query is what
// establishes that from day one.
//
// ⚠ The identifier boundary. This endpoint accepts a subject_token ONLY. It
// will refuse anything that looks like a raw national ID or MSISDN, because a
// raw identifier arriving here means the member tokenised too late — after the
// value had already crossed a network boundary. Sending it back with a 422 is
// more useful than silently accepting it and quietly breaking the guarantee the
// whole ecosystem is sold on.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isScope, MANDATORY_SCOPES } from "@/lib/consent/scopes";
import { isSubjectToken, SUBJECT_TOKEN_HEX_LENGTH } from "@/lib/oprf/node";

/** Consent runs for a year unless the member asks for less. */
const DEFAULT_TTL_DAYS = 365;

const CHANNELS = ["PWA", "LMS_CONSOLE", "MEMBER_API", "FIELD_OFFICER"] as const;

function looksLikeRawIdentifier(v: string): boolean {
  const s = v.trim();
  // Kenyan national IDs are 7–9 digits; MSISDNs 9–13. A real token is 128 hex.
  if (/^\d{6,13}$/.test(s)) return true;
  if (/^\+?254\d{9}$/.test(s)) return true;
  return false;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const subjectToken = String(body.subject_token ?? "");
  const memberCode = String(body.member_code ?? "");
  const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : [];
  const channel = String(body.captured_via ?? "MEMBER_API");
  const wordingVersion = String(
    body.wording_version ?? process.env.CONSENT_WORDING_VERSION ?? "unversioned",
  );
  const ttlDays = Number(body.ttl_days ?? DEFAULT_TTL_DAYS);

  if (!subjectToken) {
    return NextResponse.json({ error: "subject_token is required." }, { status: 400 });
  }

  if (looksLikeRawIdentifier(subjectToken)) {
    return NextResponse.json(
      {
        error: "IDENTIFIER_NOT_TOKENISED",
        message:
          "subject_token looks like a raw national ID or phone number. Tokenise inside your own node before calling the Registry — identity must never cross a boundary.",
      },
      { status: 422 },
    );
  }

  if (!isSubjectToken(subjectToken)) {
    return NextResponse.json(
      {
        error: `subject_token must be a ${SUBJECT_TOKEN_HEX_LENGTH}-character hex OPRF output.`,
      },
      { status: 400 },
    );
  }

  if (!CHANNELS.includes(channel as (typeof CHANNELS)[number])) {
    return NextResponse.json(
      { error: `captured_via must be one of ${CHANNELS.join(", ")}.` },
      { status: 400 },
    );
  }

  const unknown = scopes.filter((s) => !isScope(s));
  if (unknown.length) {
    return NextResponse.json(
      { error: `Unknown scopes: ${unknown.join(", ")}.` },
      { status: 400 },
    );
  }

  // A consent missing a mandatory scope cannot support a lending decision, so
  // refuse it at capture rather than let it fail later at the gate — where the
  // borrower is already waiting and the member has no idea why.
  const missingMandatory = MANDATORY_SCOPES.filter((s) => !scopes.includes(s));
  if (missingMandatory.length) {
    return NextResponse.json(
      {
        error: "MANDATORY_SCOPE_MISSING",
        message:
          "A consent that omits a mandatory scope cannot support a lending decision.",
        missing: missingMandatory,
      },
      { status: 422 },
    );
  }

  const member = await prisma.member.findUnique({ where: { code: memberCode } });
  if (!member) {
    return NextResponse.json({ error: `Unknown member_code "${memberCode}".` }, { status: 404 });
  }

  const ref = `csn_${randomBytes(16).toString("hex")}`;
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

  const consent = await prisma.consent.create({
    data: {
      ref,
      subjectToken,
      memberId: member.id,
      scopes,
      wordingVersion,
      capturedVia: channel as (typeof CHANNELS)[number],
      expiresAt,
      evidence: (body.evidence ?? null) as never,
      events: { create: { kind: "CAPTURED", actorMemberId: member.id } },
    },
  });

  return NextResponse.json(
    {
      consent_ref: consent.ref,
      subject_token: consent.subjectToken,
      scopes: consent.scopes,
      wording_version: consent.wordingVersion,
      captured_at: consent.capturedAt,
      expires_at: consent.expiresAt,
    },
    { status: 201 },
  );
}
