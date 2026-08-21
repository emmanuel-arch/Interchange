// ─────────────────────────────────────────────────────────────────────────────
// POST /api/authorise — the hard gate, exposed.
//
// Every Interchange service calls this before answering anything. It is the one
// place a call can be granted, and it always leaves an audit row — including
// when it refuses.
//
// ⚠ caller_code is read from the BODY here, which is only acceptable because
// there is no authentication yet. Once Sprint 2 lands the Registry, the caller
// is resolved from their mTLS certificate and this field is ignored. A member
// who can name themselves in a request body can impersonate any other member.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorise } from "@/lib/consent/gate";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const callerCode = String(body.caller_code ?? "");
  const serviceCode = String(body.service_code ?? "");
  const subjectToken = String(body.subject_token ?? "");
  const consentRef = body.consent_ref ? String(body.consent_ref) : null;

  if (!callerCode || !serviceCode || !subjectToken) {
    return NextResponse.json(
      { error: "caller_code, service_code and subject_token are required." },
      { status: 400 },
    );
  }

  const caller = await prisma.member.findUnique({ where: { code: callerCode } });
  if (!caller) {
    return NextResponse.json({ error: `Unknown caller_code "${callerCode}".` }, { status: 404 });
  }

  const service = await prisma.service.findUnique({ where: { code: serviceCode } });
  if (!service) {
    return NextResponse.json({ error: `Unknown service_code "${serviceCode}".` }, { status: 404 });
  }

  const started = Date.now();
  const result = await authorise({
    callerId: caller.id,
    serviceCode,
    subjectToken,
    consentRef,
  });

  // Record how long the decision itself took. Latency of the gate is a real
  // operational number — it sits inside the <400ms exposure budget.
  await prisma.auditEntry.update({
    where: { id: result.auditId },
    data: { latencyMs: Date.now() - started },
  });

  if (!result.ok) {
    return NextResponse.json(
      { authorised: false, outcome: result.outcome, reason: result.reason, audit_id: result.auditId },
      { status: 403 },
    );
  }

  return NextResponse.json({
    authorised: true,
    service: service.code,
    audit_id: result.auditId,
  });
}
