// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/report — the member-facing report endpoint.
//
// This is the first thing a member with a node can actually USE: one call, one
// envelope, every report the Interchange publishes, in JSON, HTML or PDF.
//
// ── THE ENVELOPE IS METROPOL-SHAPED ON PURPOSE ───────────────────────────────
// Same request keys (`report_type`, `identity_number`, `identity_type`,
// `loan_amount`, `report_reason`), same `api_code` / `api_code_description` /
// `has_error` semantics, same report-type integers where an equivalent exists.
// A member already integrated with Metropol changes a base URL and a key pair
// and keeps their parsing code. That constraint costs some elegance and buys
// the cheapest migration path available, which is the right trade while nobody
// has joined yet.
//
// What is NOT Metropol-shaped: the authentication. Metropol authenticate with a
// shared secret in a header hash; the Interchange requires an Ed25519 signature
// over the canonical request, so a member's identity cannot be replayed, forged
// by anyone holding a log, or repudiated afterwards.
//
// ── THE ORDER OF CHECKS, AND WHY IT IS THIS ORDER ────────────────────────────
//   1. SIGNATURE — who is asking. Before anything is read from the body, because
//      an unverified caller has no identity to attribute anything to.
//   2. SUBJECT — derive the token from the identifier under the ecosystem key,
//      and require it to match the consent presented. This is what stops one
//      borrower's consent being used to buy another borrower's file, and it is
//      only possible because the Registry holds the key and the member does not.
//   3. GATE — reciprocity, quota, consent, scope. The one chokepoint.
//   4. FETCH — ecosystem fan-out, or the contract holder's bureau call.
//   5. LOG — hash-chained, with the response digest, granted or refused.
//
// A refusal is logged as loudly as a grant. "The Registry turned me down" has to
// be provable by the member, or it is unfalsifiable.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { authorise } from "@/lib/consent/gate";
import { verifyRequest } from "@/lib/signing";
import { append } from "@/lib/messagelog";
import { isSubjectToken, identifierInput, normaliseNationalId } from "@/lib/oprf/node";
import { evaluateDirect } from "@/lib/oprf/registry";
import { reportByType, quote, type ReportFormat } from "@/lib/reports/catalogue";
import { buildFile } from "@/lib/reports/bureau";
import { bureauCreditFile, exposureReport } from "@/lib/reports/documents";
import { renderReportHtml } from "@/lib/reports/shell";
import { htmlToPdf, chromiumPath, RenderUnavailable } from "@/lib/reports/render";
import { pullFromContractHolder, pullFromReplay, replayDir, BureauUnavailable } from "@/lib/reports/source";
import { IX_CODES, ixError, type IxCodeKey } from "@/lib/codes/interchange";
import { normaliseApiCode } from "@/lib/codes/metropol";

export const runtime = "nodejs";
/** A bureau pull is several serial third-party calls; the default 10s is not enough. */
export const maxDuration = 120;

const FORMATS: ReportFormat[] = ["json", "html", "pdf", "bundle"];

/**
 * A request-shape error. These keep the bureau's E-code where the bureau has one
 * for the same mistake (E006, E008, E011, E014), so a migrating parser still
 * recognises them — but the Interchange raised them, and says so.
 */
function fail(apiCode: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { has_error: true, api_code: apiCode, api_code_description: message, api_code_source: "interchange", ...extra },
    { status },
  );
}

/** An Interchange decision, from the IX table in lib/codes/interchange.ts. */
function refuse(key: IxCodeKey, detail?: string, extra: Record<string, unknown> = {}) {
  const e = ixError(key, detail, { api_code_source: "interchange", ...extra });
  return NextResponse.json(e.body, { status: e.status });
}

const VERIFY_CODE: Record<string, IxCodeKey> = {
  MISSING_HEADERS: "IX001",
  NO_REGISTERED_KEY: "IX002",
  BAD_SIGNATURE: "IX003",
  CLOCK_SKEW: "IX004",
};

export async function POST(request: Request) {
  const started = Date.now();
  const raw = await request.text();

  // ── 1. Who is asking ──────────────────────────────────────────────────────
  const callerCode = request.headers.get("x-interchange-member") ?? "";
  const caller = callerCode ? await prisma.member.findUnique({ where: { code: callerCode } }) : null;

  const verified = verifyRequest({
    method: "POST",
    path: "/api/v1/report",
    body: raw,
    headers: request.headers,
    publicKeyHex: caller?.publicKey ?? null,
  });
  if (!verified.ok) {
    return refuse(VERIFY_CODE[verified.failure] ?? "IX003", verified.message);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("E006", "Invalid JSON object.", 400);
  }

  const reportType = Number(body.report_type);
  const def = reportByType(reportType);
  if (!def) return fail("E011", `Invalid report type ${body.report_type}.`, 400);
  if (!def.live) {
    return refuse("IX602", `Report ${reportType} (${def.name}) is specified but not yet live.`);
  }

  const format = String(body.format ?? "json").toLowerCase() as ReportFormat;
  if (!FORMATS.includes(format)) return fail("E006", `format must be one of ${FORMATS.join(", ")}.`, 400);
  if (!def.formats.includes(format)) {
    return fail("E006", `Report ${reportType} is not available as ${format}.`, 400);
  }

  // ── 2. Who it is about ────────────────────────────────────────────────────
  // Either an identifier (which the Registry tokenises itself) or a token the
  // member derived through the blinded exchange. The bureau path REQUIRES the
  // identifier, because Metropol key on the national ID and no token they have
  // never seen can buy a report.
  const identityNumber = body.identity_number ? String(body.identity_number) : null;
  const suppliedToken = body.subject_token ? String(body.subject_token) : null;

  let subjectToken: string;
  if (identityNumber) {
    const clean = normaliseNationalId(identityNumber);
    if (!clean) return fail("E014", "identity_number is not a usable national ID.", 400);
    const input = new TextEncoder().encode(identifierInput("national_id", clean));
    const key = process.env.INTERCHANGE_OPRF_KEY;
    if (!key) return fail("E001", "The token service is not configured on this deployment.", 503);
    subjectToken = evaluateDirect(key, input);

    // A member that ALSO sent a token must agree with us about who this is.
    // Disagreement means their normalisation has drifted from ours, which is
    // the fault that silently makes exposure queries return "nobody" — so it is
    // refused loudly rather than resolved in either direction.
    if (suppliedToken && suppliedToken.toLowerCase() !== subjectToken) {
      return refuse("IX701");
    }
  } else if (suppliedToken && isSubjectToken(suppliedToken)) {
    if (def.bureauReports.length > 0) {
      return refuse("IX702", `Report ${reportType} needs identity_number: it is fetched from a bureau, and a bureau cannot look up a subject token.`);
    }
    subjectToken = suppliedToken.toLowerCase();
  } else {
    return fail("E008", "Provide identity_number, or a subject_token derived through /api/oprf/evaluate.", 400);
  }

  const consentRef = body.consent_ref ? String(body.consent_ref) : null;

  // ── 3. The gate ───────────────────────────────────────────────────────────
  const decision = await authorise({
    callerId: caller!.id,
    serviceCode: def.code,
    subjectToken,
    consentRef,
  });

  if (!decision.ok) {
    const responseBody = {
      has_error: true,
      api_code: decision.code,
      api_code_description: decision.reason,
      api_code_source: "interchange",
      retryable: IX_CODES[decision.code].retryable,
      report_type: reportType,
      outcome: decision.outcome,
      audit_id: decision.auditId,
    };
    const responseJson = JSON.stringify(responseBody);
    await append({
      callerCode: caller!.code,
      serviceCode: def.code,
      subjectToken,
      consentRef,
      outcome: decision.outcome,
      requestDigest: verified.digest,
      responseDigest: createHash("sha256").update(responseJson, "utf8").digest("hex"),
      callerSignature: verified.signature,
    });
    return NextResponse.json(responseBody, { status: IX_CODES[decision.code].http });
  }

  // ── 4. Fetch the evidence ─────────────────────────────────────────────────
  let documentJson: Record<string, unknown>;
  let html: string | null = null;
  let billedPulls = 0;
  let sourceLabel = "";
  let replayed = false;

  try {
    if (def.bureauReports.length > 0) {
      const answer = replayDir()
        ? ((replayed = true), await pullFromReplay(def.bureauReports))
        : await pullFromContractHolder({
            identityNumber: normaliseNationalId(identityNumber!)!,
            identityType: String(body.identity_type ?? "001"),
            reportTypes: def.bureauReports,
            loanAmount: Number(body.loan_amount ?? 10_000),
            reportReason: Number(body.report_reason ?? 1),
            onBehalfOf: caller!.code,
          });

      const ok = answer.pulls.filter((p) => p.ok && p.payload);
      if (ok.length === 0) {
        const refusal = answer.pulls.find((p) => p.apiCode);
        const upstream = normaliseApiCode(refusal?.apiCode);
        // The bureau's own code passes through untouched — E017 means a thin
        // file to every parser written against the bureau, and it must keep
        // meaning that here. Only a refusal with no bureau code becomes IX402.
        if (!upstream) return refuse("IX402", refusal?.message ?? undefined, { report_type: reportType, subject_token: subjectToken });
        return NextResponse.json(
          {
            has_error: true,
            api_code: upstream,
            api_code_description: refusal?.message ?? "The bureau returned no data for this identity.",
            api_code_source: "bureau",
            report_type: reportType,
            subject_token: subjectToken,
          },
          { status: 200 }, // A thin file is an ANSWER, not a transport failure.
        );
      }

      billedPulls = answer.billed;
      sourceLabel = replayed
        ? `Replayed capture · Metropol reports ${ok.map((p) => p.reportType).join(", ")}`
        : `Metropol CRB via ${answer.contractHolder} · reports ${ok.map((p) => p.reportType).join(", ")}`;

      const file = buildFile(ok.map((p) => ({ reportType: p.reportType, payload: p.payload! })));
      const doc = bureauCreditFile(file, {
        member: { code: caller!.code, name: caller!.name },
        subjectToken,
        consentRef,
        generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
        environment: replayed ? "REPLAY — NOT A LIVE PULL" : null,
        source: sourceLabel,
      },
      { reportType: def.type, title: def.name });

      documentJson = { ...structuredJson(doc.meta, reportType), file, quote: quote(reportType, { contributing: true }) };
      if (format !== "json") html = renderReportHtml(doc);
    } else {
      // ── Ecosystem-native ────────────────────────────────────────────────
      // The Registry does NOT fan out. The calling node does, against filters
      // it downloaded earlier, so no third party — including us — learns which
      // members hold the borrower. That is the privacy argument the whole
      // exposure design rests on and it is not negotiable for a formatting
      // convenience.
      //
      // What the Registry can do is TYPESET an answer the caller already has.
      // A node that has run its own broker sends the aggregates back here and
      // gets the document — which is what stops every member having to carry a
      // PDF renderer, a font stack and a chart library inside their perimeter.
      // Nothing new is disclosed: the token and the consent were already in the
      // gate call, and the aggregates are the caller's own.
      const supplied = body.exposure as Record<string, unknown> | undefined;
      if (!supplied || typeof supplied !== "object") {
        return fail(
          "E015",
          `Report ${reportType} is answered by your own node's broker, not by the Registry. Run queryExposure() ` +
            "locally and send the result back as `exposure` to have it rendered, or request format=json for the grant alone.",
          400,
          { report_type: reportType, subject_token: subjectToken, audit_id: decision.auditId },
        );
      }

      const e = {
        activeLoans: Number(supplied.active_loans ?? supplied.activeLoans ?? 0),
        lenders: Number(supplied.lenders ?? 0),
        outstandingBand: String(supplied.outstanding_band ?? supplied.outstandingBand ?? "none"),
        worstBucket: String(supplied.worst_bucket ?? supplied.worstBucket ?? "due"),
        newestDisbursement: (supplied.newest_disbursement ?? supplied.newestDisbursement ?? null) as string | null,
        velocity14d: Number(supplied.velocity_14d ?? supplied.velocity14d ?? 0),
        partial: Boolean(supplied.partial),
        screened: Number(supplied.screened ?? 0),
        queried: Number(supplied.queried ?? 0),
        responded: Number(supplied.responded ?? 0),
        silent: (supplied.silent ?? []) as { memberCode: string; reason: string }[],
        lendersNamed: (supplied.lenders_named ?? supplied.lendersNamed ?? null) as string[] | null,
        timings: (supplied.timings ?? undefined) as { screenMs: number; fanoutMs: number; totalMs: number } | undefined,
        asOf: String(supplied.as_of ?? supplied.asOf ?? new Date().toISOString()),
      };

      sourceLabel = `${e.responded} member node${e.responded === 1 ? "" : "s"}, brokered by ${caller!.code}`;
      const doc = exposureReport(e, {
        member: { code: caller!.code, name: caller!.name },
        subjectToken,
        consentRef,
        generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
        environment: null,
        source: sourceLabel,
      });

      documentJson = {
        ...structuredJson(doc.meta, reportType),
        exposure: e,
        quote: quote(reportType, { contributing: true }),
      };
      if (format !== "json") html = renderReportHtml(doc);
    }
  } catch (e) {
    if (e instanceof BureauUnavailable) {
      return refuse(e.reason === "refused" ? "IX403" : "IX401", e.message);
    }
    throw e;
  }

  // ── 5. Render and log ─────────────────────────────────────────────────────
  const latencyMs = Date.now() - started;
  await prisma.auditEntry.update({ where: { id: decision.auditId }, data: { latencyMs } });

  const responseDigest = createHash("sha256")
    .update(html ?? JSON.stringify(documentJson), "utf8")
    .digest("hex");

  const entry = await append({
    callerCode: caller!.code,
    serviceCode: def.code,
    subjectToken,
    consentRef,
    outcome: "GRANTED",
    requestDigest: verified.digest,
    responseDigest,
    callerSignature: verified.signature,
  });

  const headers: Record<string, string> = {
    "x-interchange-log-seq": entry.seq.toString(),
    "x-interchange-log-hash": entry.hash,
    "x-interchange-response-digest": responseDigest,
    "x-interchange-billed-pulls": String(billedPulls),
    "x-interchange-latency-ms": String(latencyMs),
  };

  if (format === "json") {
    return NextResponse.json({ ...documentJson, receipt: { seq: entry.seq.toString(), hash: entry.hash } }, { headers });
  }

  if (format === "html") {
    return new NextResponse(html!, { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
  }

  // ── bundle: the structured file AND the document, from one pull ──────────
  // The PDF is base64 inside JSON rather than a multipart body because the
  // caller is a server, not a browser: it stores one and streams the other, and
  // multipart parsing on both sides would buy nothing.
  if (format === "bundle") {
    if (!chromiumPath()) {
      return refuse("IX603", "PDF rendering is not available on this deployment, so a bundle cannot be assembled. Request format=json.", {
        report_type: reportType,
        formats_available: ["json", "html"],
      });
    }
    const pdf = await htmlToPdf(html!);
    return NextResponse.json(
      {
        ...documentJson,
        receipt: { seq: entry.seq.toString(), hash: entry.hash },
        document: {
          media_type: "application/pdf",
          encoding: "base64",
          bytes: pdf.length,
          content: pdf.toString("base64"),
        },
      },
      { headers },
    );
  }

  // PDF. The renderer needs a browser binary, which a serverless deployment does
  // not have — so this answers 503 with the reason rather than a broken file.
  if (!chromiumPath()) {
    return refuse("IX603", "PDF rendering is not available on this deployment (no headless browser). Request format=html, or call the engine host.", {
      report_type: reportType,
      formats_available: ["json", "html"],
    });
  }

  try {
    const pdf = await htmlToPdf(html!);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        ...headers,
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="interchange-report-${reportType}-${subjectToken.slice(0, 8)}.pdf"`,
      },
    });
  } catch (e) {
    if (e instanceof RenderUnavailable) return refuse("IX603", e.message);
    throw e;
  }
}

/** The envelope every JSON answer carries, Metropol-compatible. */
function structuredJson(meta: { generatedAt: string; source?: string }, reportType: number) {
  return {
    has_error: false,
    api_code: null,
    api_code_description: null,
    report_type: reportType,
    generated_at: meta.generatedAt,
    source: meta.source,
  };
}
