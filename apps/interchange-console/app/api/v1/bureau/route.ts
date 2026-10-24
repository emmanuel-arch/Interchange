// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/bureau — Bureau Direct: a member's own choice of Metropol
// reports, through the Interchange, metered.
//
// WHY THIS EXISTS (24 Oct 2026). The founder's rule is that every CRB call to
// Metropol passes through the Interchange, so that no reading goes unmetered.
// The Lending Console had one path that did not: its older "Run CRB check"
// (Customer 360, the application's credit step, the customer portal) asked
// Metropol directly for whatever report SET the lender's scrutiny tier names —
// screen, standard, deep — and merged the answers itself. Those sets are not
// Interchange report types, and forcing them into one would change what a
// lender's own tier buys. So this endpoint carries the set as asked:
//
//   signed member request → consent gate (bureau.pull, via report-12's
//   subscription) → METER (opened before the bureau is asked) → the contract
//   holder's node → the bureau's bodies, verbatim → hash-chained log.
//
// Nothing is rendered and nothing is stored here: the member merges the bodies
// as it always has. The price is the rate card for the reports that answered,
// with no Interchange fee — this is passage, not a product.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyRequest } from "@/lib/signing";
import { authorise } from "@/lib/consent/gate";
import { append } from "@/lib/messagelog";
import { identifierInput, normaliseNationalId } from "@/lib/oprf/node";
import { evaluateDirect } from "@/lib/oprf/registry";
import { pullFromContractHolder, BureauUnavailable } from "@/lib/reports/source";
import { IX_CODES } from "@/lib/codes/interchange";
import { actorFrom, channelFrom, openMeter, settleMeter } from "@/lib/meter";
import { fail, refuse } from "@/lib/reports/serve";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Metropol report numbers the contract is entitled to (the 16 Sep 2026 sweep). */
const ENTITLED = new Set([1, 2, 3, 5, 6, 8, 10, 11, 12, 13, 14, 16]);
const MAX_REPORTS = 6;

export async function POST(request: Request) {
  const started = Date.now();
  const raw = await request.text();

  const callerCode = request.headers.get("x-interchange-member") ?? "";
  const caller = callerCode ? await prisma.member.findUnique({ where: { code: callerCode } }) : null;
  const verified = verifyRequest({ method: "POST", path: "/api/v1/bureau", body: raw, headers: request.headers, publicKeyHex: caller?.publicKey ?? null });
  if (!verified.ok) return refuse("IX003", verified.message);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("E006", "Invalid JSON object.", 400);
  }

  const id = normaliseNationalId(body.identity_number);
  if (!id) return fail("E014", "identity_number is not a usable national ID.", 400);
  const requested = Array.isArray(body.report_types) ? [...new Set(body.report_types.map(Number))] : [];
  const types = requested.filter((t) => ENTITLED.has(t));
  if (types.length === 0) return fail("E011", `None of the requested reports are on the contract. Entitled: ${[...ENTITLED].join(", ")}.`, 400);
  if (types.length > MAX_REPORTS) return fail("E011", `At most ${MAX_REPORTS} reports per request.`, 400);

  const key = process.env.INTERCHANGE_OPRF_KEY;
  if (!key) return fail("E001", "The token service is not configured on this deployment.", 503);
  const subjectToken = evaluateDirect(key, new TextEncoder().encode(identifierInput("national_id", id)));
  const consentRef = body.consent_ref ? String(body.consent_ref) : null;

  // ── The gate: a bureau pull needs bureau.pull, as report 12 does ──────────
  const decision = await authorise({ callerId: caller!.id, serviceCode: "report-12", subjectToken, consentRef });
  if (!decision.ok) {
    const refusal = { has_error: true, api_code: decision.code, api_code_description: decision.reason, outcome: decision.outcome };
    await append({
      callerCode: caller!.code, serviceCode: "report-12", subjectToken, consentRef, outcome: decision.outcome,
      requestDigest: verified.digest, responseDigest: createHash("sha256").update(JSON.stringify(refusal), "utf8").digest("hex"),
      callerSignature: verified.signature,
    });
    return NextResponse.json(refusal, { status: IX_CODES[decision.code].http });
  }

  // ── The meter, before the bureau ──────────────────────────────────────────
  const def = { type: 0, name: `Bureau Direct · reports ${types.join(", ")}`, interchangeFee: 0, bureauReports: types };
  const channel = channelFrom(body.channel);
  let meterId: string;
  try {
    meterId = await openMeter({ member: caller!, def, channel, actor: actorFrom(body.requested_by, channel), subjectToken, consentRef });
  } catch (e) {
    console.error("[bureau] meter could not be opened — refusing:", e);
    return refuse("IX401", "The usage meter is unavailable, so nothing was requested from the bureau. Try again in a moment.");
  }

  let answer;
  try {
    answer = await pullFromContractHolder({
      identityNumber: id,
      identityType: String(body.identity_type ?? "001"),
      reportTypes: types,
      loanAmount: Number(body.loan_amount ?? 10_000),
      reportReason: Number(body.report_reason ?? 1),
      onBehalfOf: caller!.code,
    });
  } catch (e) {
    if (e instanceof BureauUnavailable) {
      await settleMeter(meterId, { state: "NOT_BILLED", def, servedFrom: null, billedPulls: 0, answered: [], detail: e.message });
      return refuse(e.reason === "refused" ? "IX403" : "IX401", e.message);
    }
    throw e;
  }

  const answered = answer.pulls.filter((p) => p.ok && p.payload).map((p) => p.reportType);
  const response = {
    has_error: false,
    contract_holder: answer.contractHolder,
    billed: answer.billed,
    pulls: answer.pulls.map((p) => ({ report_type: p.reportType, ok: p.ok, payload: p.payload, api_code: p.apiCode, message: p.message, ms: p.ms })),
  };
  const entry = await append({
    callerCode: caller!.code,
    serviceCode: "report-12",
    subjectToken,
    consentRef,
    outcome: "GRANTED",
    requestDigest: verified.digest,
    responseDigest: createHash("sha256").update(JSON.stringify(response), "utf8").digest("hex"),
    callerSignature: verified.signature,
  });
  await prisma.auditEntry.update({ where: { id: decision.auditId }, data: { latencyMs: Date.now() - started } }).catch(() => {});
  await settleMeter(meterId, {
    state: answer.billed > 0 ? "BILLED" : "NOT_BILLED",
    def,
    servedFrom: "bureau",
    billedPulls: answer.billed,
    answered,
    logSeq: entry.seq,
    detail: `Metropol via ${answer.contractHolder} · answered ${answered.join(", ") || "none"}`,
  });

  return NextResponse.json(
    { ...response, receipt: { seq: entry.seq.toString(), hash: entry.hash } },
    { headers: { "x-interchange-log-seq": entry.seq.toString(), "x-interchange-billed-pulls": String(answer.billed), "x-interchange-meter": meterId } },
  );
}
