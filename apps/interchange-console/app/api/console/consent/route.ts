// POST /api/console/consent — an operator records how the customer authorised
// a credit reference check.
//
// The Lending Console's consent panel, on the Interchange: how it was given
// (from the same three ways), a note, and the attestation ticked under the
// operator's own name. Never pre-filled, never assumed — the box is the
// operator's statement, and it is kept with the consent word for word.
//
// The consent is recorded in the ACTING MEMBER's name (they are the controller
// who relies on it), captured via INTERCHANGE_CONSOLE, against the subject token
// only. It covers ATTESTED_SCOPES and runs for a year, as a member-captured
// consent does through /api/consent.
import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/operator";
import { readJson, refusalOr, sessionOr401 } from "@/lib/console/http";
import { actingMember, ATTESTATION, ATTESTED_SCOPES, CONSENT_BASES, liveConsent, tokenFor } from "@/lib/console/subject";

export const runtime = "nodejs";

const TTL_DAYS = 365;
const WORDING = "interchange-console-attestation-v1";

export async function POST(request: NextRequest) {
  const session = sessionOr401(request, "consent:capture");
  if (session instanceof NextResponse) return session;
  const body = await readJson(request);

  try {
    const member = await actingMember(session, typeof body.member_code === "string" ? body.member_code : null);
    const basis = String(body.basis ?? "");
    if (!CONSENT_BASES[basis]) return NextResponse.json({ error: "BASIS", message: "Say how the customer gave their consent." }, { status: 400 });
    if (body.attest !== true) {
      return NextResponse.json({ error: "ATTEST", message: "Tick the confirmation — it is your statement, under your name." }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
    const subjectToken = tokenFor(String(body.national_id ?? ""));

    const existing = await liveConsent(member.id, subjectToken, ATTESTED_SCOPES);
    if (existing) return NextResponse.json({ ok: true, consent: existing, existing: true });

    const consent = await prisma.consent.create({
      data: {
        ref: `csn_${randomBytes(16).toString("hex")}`,
        subjectToken,
        memberId: member.id,
        scopes: ATTESTED_SCOPES,
        wordingVersion: WORDING,
        capturedVia: "INTERCHANGE_CONSOLE",
        expiresAt: new Date(Date.now() + TTL_DAYS * 86_400_000),
        evidence: {
          surface: "Interchange console",
          basis,
          basisLabel: CONSENT_BASES[basis],
          note: note || null,
          attestation: ATTESTATION,
          attestedBy: { operatorId: session.sub, name: session.name, email: session.email ?? null, role: session.role },
          ip: clientIp(request.headers),
          at: new Date().toISOString(),
        },
        events: { create: { kind: "CAPTURED", actorMemberId: member.id, detail: `attested by ${session.name}` } },
      },
    });

    return NextResponse.json({ ok: true, consent: await liveConsent(member.id, subjectToken, ATTESTED_SCOPES), ref: consent.ref });
  } catch (e) {
    return refusalOr(e);
  }
}
