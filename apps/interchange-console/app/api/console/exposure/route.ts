// POST /api/console/exposure — Live Exposure, from the console, in production.
//
// The question "does this borrower owe other members right now?" asked as the
// operator's own member: through the gate first (exposure-v1 needs a consent
// covering ecosystem.exposure, and the call is audited and hash-chained whether
// granted or refused), then the broker — Bloom screen, ask only the candidates,
// aggregate — with each member's answer read in-process (lib/exposure/local).
//
// Exposure is free at the point of use for a contributing member and has no
// bureau cost, so it is logged but not metered.
import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { authorise } from "@/lib/consent/gate";
import { append } from "@/lib/messagelog";
import { readJson, refusalOr, sessionOr401 } from "@/lib/console/http";
import { actingMember, liveConsent, tokenFor } from "@/lib/console/subject";
import { localExposure } from "@/lib/exposure/local";
import { tokenPreview } from "@/lib/oprf/node";
import { lenderDoorForMember } from "@/lib/lenders";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const started = Date.now();
  const session = sessionOr401(request, "exposure:query");
  if (session instanceof NextResponse) return session;
  const body = await readJson(request);

  try {
    const member = await actingMember(session, typeof body.member_code === "string" ? body.member_code : null);
    const subjectToken = tokenFor(String(body.national_id ?? ""));
    const consent = await liveConsent(member.id, subjectToken, ["ecosystem.exposure"]);

    const decision = await authorise({ callerId: member.id, serviceCode: "exposure-v1", subjectToken, consentRef: consent?.ref ?? null });
    const requestDigest = createHash("sha256")
      .update(JSON.stringify({ via: "interchange-console", operator: session.sub, member: member.code, service: "exposure-v1", subject: subjectToken, at: started }), "utf8")
      .digest("hex");

    if (!decision.ok) {
      const refusal = { has_error: true, api_code: decision.code, api_code_description: decision.reason, outcome: decision.outcome };
      await append({
        callerCode: member.code,
        serviceCode: "exposure-v1",
        subjectToken,
        consentRef: consent?.ref ?? null,
        outcome: decision.outcome,
        requestDigest,
        responseDigest: createHash("sha256").update(JSON.stringify(refusal), "utf8").digest("hex"),
        callerSignature: null,
      });
      return NextResponse.json({ error: decision.code, message: decision.reason, needsConsent: decision.outcome === "REFUSED_NO_CONSENT" }, { status: 403 });
    }

    const result = await localExposure(member.code, subjectToken, lenderDoorForMember(member.code)?.members ?? [member.code]);
    await prisma.auditEntry.update({ where: { id: decision.auditId }, data: { latencyMs: Date.now() - started, respondents: result.responded } });
    const entry = await append({
      callerCode: member.code,
      serviceCode: "exposure-v1",
      subjectToken,
      consentRef: consent!.ref,
      outcome: "GRANTED",
      requestDigest,
      responseDigest: createHash("sha256").update(JSON.stringify(result), "utf8").digest("hex"),
      callerSignature: null,
    });

    // Name the silent members — "has not published" is a known gap, not an outage.
    const names = new Map(
      (await prisma.member.findMany({ where: { code: { in: result.silent.map((s) => s.memberCode) } }, select: { code: true, name: true } })).map((m) => [m.code, m.name]),
    );
    return NextResponse.json({
      ok: true,
      member: { code: member.code, name: member.name },
      result: { ...result, subjectToken: tokenPreview(subjectToken) },
      silent: result.silent.map((s) => ({ ...s, name: names.get(s.memberCode) ?? s.memberCode })),
      receipt: { seq: entry.seq.toString(), hash: entry.hash },
    });
  } catch (e) {
    return refusalOr(e);
  }
}
