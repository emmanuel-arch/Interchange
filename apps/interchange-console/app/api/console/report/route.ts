// POST /api/console/report — an operator pulls a bureau report from the console.
//
// The same room as /api/v1/report (lib/reports/serve): the consent gate, the
// meter, the store before the bureau, the hash-chained log, the member's own
// letterhead on the document. What differs is only the door — a signed-in
// operator acting for their own member instead of a node's signature — and so
// the meter records the channel as INTERCHANGE and the operator by name.
//
// The consent presented is the acting member's own live consent for this
// subject, found here; an operator cannot pass one in. No consent, no pull: the
// gate refuses and says so, and the page asks for it first.
import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { readJson, refusalOr, sessionOr401 } from "@/lib/console/http";
import { actingMember, liveConsent, tokenFor } from "@/lib/console/subject";
import { reportByType } from "@/lib/reports/catalogue";
import { serveReport } from "@/lib/reports/serve";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const started = Date.now();
  const session = sessionOr401(request, "reports:run");
  if (session instanceof NextResponse) return session;
  const body = await readJson(request);

  try {
    const member = await actingMember(session, typeof body.member_code === "string" ? body.member_code : null);
    const def = reportByType(Number(body.report_type));
    if (!def || !def.live || def.bureauReports.length === 0) {
      return NextResponse.json({ error: "REPORT", message: "That report cannot be pulled from here." }, { status: 400 });
    }
    const nationalId = String(body.national_id ?? "");
    const subjectToken = tokenFor(nationalId);
    const consent = await liveConsent(member.id, subjectToken, def.requiredScopes);
    if (!consent) {
      return NextResponse.json(
        { error: "NO_CONSENT", message: "No consent on record covers this report. Record how the customer authorised the check first." },
        { status: 403 },
      );
    }

    // What the message log records as the request: who, for whom, what — never the ID.
    const requestDigest = createHash("sha256")
      .update(JSON.stringify({ via: "interchange-console", operator: session.sub, member: member.code, report_type: def.type, subject: subjectToken, at: started }), "utf8")
      .digest("hex");

    const res = await serveReport({
      caller: member,
      body: {
        report_type: def.type,
        identity_number: nationalId,
        consent_ref: consent.ref,
        format: "pdf",
        loan_amount: Number(body.loan_amount ?? 10_000) || 10_000,
        report_reason: 1,
        ...(body.fresh === true ? { fresh: true } : {}),
      },
      requestDigest,
      callerSignature: null,
      channel: "INTERCHANGE",
      actor: { kind: "operator", name: session.name, email: session.email ?? null, ref: session.sub, surface: "customer-search" },
      started,
    });

    // A refusal from the gate or the bureau is JSON; make sure the page gets a sentence.
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("pdf")) {
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return NextResponse.json(
        {
          error: String(j.api_code ?? "REFUSED"),
          message: String(j.api_code_description ?? j.message ?? "The report could not be produced."),
        },
        { status: res.ok ? 422 : res.status },
      );
    }
    return res;
  } catch (e) {
    return refusalOr(e);
  }
}
