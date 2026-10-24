// ─────────────────────────────────────────────────────────────────────────────
// SERVE ONE REPORT — everything /api/v1/report does once it knows who is asking.
//
// Two doors lead here, and they must be the same room:
//
//   · /api/v1/report — a member's node, proved by Ed25519 signature. The
//     Lending Console (Risk stage, Customer 360, Run CRB check) and the
//     ServiceSuite bridge come in this way.
//   · /api/console/report — an operator signed in to the Interchange console,
//     acting for their own member.
//
// Before 24 Oct 2026 this was the body of the route, so the console could not
// pull a report without forging a member signature. It is lifted out unchanged
// in its order — subject, gate, fetch, log, keep — with one step added: the
// METER (lib/meter.ts), opened after the gate grants and before the bureau is
// asked, so no bureau reading can leave this function unmetered.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import type { Member, MeterChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorise } from "@/lib/consent/gate";
import { append } from "@/lib/messagelog";
import { isSubjectToken, identifierInput, normaliseNationalId } from "@/lib/oprf/node";
import { evaluateDirect } from "@/lib/oprf/registry";
import { reportByType, quote, type ReportFormat } from "@/lib/reports/catalogue";
import { buildFile } from "@/lib/reports/bureau";
import { bureauCreditFile, exposureReport } from "@/lib/reports/documents";
import { renderReportHtml } from "@/lib/reports/shell";
import { htmlToPdf, canRenderPdf, rendererKind, RenderUnavailable } from "@/lib/reports/render";
import { pullFromContractHolder, pullFromReplay, replayDir, BureauUnavailable } from "@/lib/reports/source";
import { freshPull, recordPull } from "@/lib/reports/store";
import type { BureauFile } from "@/lib/reports/bureau";
import { IX_CODES, ixError, type IxCodeKey } from "@/lib/codes/interchange";
import { normaliseApiCode } from "@/lib/codes/metropol";
import { openMeter, settleMeter, type MeterActor } from "@/lib/meter";

const FORMATS: ReportFormat[] = ["json", "html", "pdf", "bundle"];

/**
 * A request-shape error. These keep the bureau's E-code where the bureau has one
 * for the same mistake (E006, E008, E011, E014), so a migrating parser still
 * recognises them — but the Interchange raised them, and says so.
 */
export function fail(apiCode: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { has_error: true, api_code: apiCode, api_code_description: message, api_code_source: "interchange", ...extra },
    { status },
  );
}

/** An Interchange decision, from the IX table in lib/codes/interchange.ts. */
export function refuse(key: IxCodeKey, detail?: string, extra: Record<string, unknown> = {}) {
  const e = ixError(key, detail, { api_code_source: "interchange", ...extra });
  return NextResponse.json(e.body, { status: e.status });
}

export type ServeArgs = {
  caller: Member;
  body: Record<string, unknown>;
  /** sha256 of the request as received — the message log's request digest. */
  requestDigest: string;
  /** The member's Ed25519 signature; null for an operator's console session. */
  callerSignature: string | null;
  /** Which door, and who — the meter's attribution. */
  channel: MeterChannel;
  actor: MeterActor;
  started: number;
};

export async function serveReport({ caller, body, requestDigest, callerSignature, channel, actor, started }: ServeArgs): Promise<NextResponse> {
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
  /** The bureau's own bodies alongside the file — the member bought them. */
  const includeWire = body.include_wire === true;

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
  const decision = await authorise({ callerId: caller.id, serviceCode: def.code, subjectToken, consentRef });

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
      callerCode: caller.code,
      serviceCode: def.code,
      subjectToken,
      consentRef,
      outcome: decision.outcome,
      requestDigest,
      responseDigest: createHash("sha256").update(responseJson, "utf8").digest("hex"),
      callerSignature,
    });
    return NextResponse.json(responseBody, { status: IX_CODES[decision.code].http });
  }

  // ── 3½. The meter — before a single byte goes to the bureau ───────────────
  // A bureau reading that cannot be metered does not happen: the founder's rule
  // is that nothing is read without being metered and billed, and the only way
  // to make that true is to refuse here rather than to apologise later.
  let meterId: string | null = null;
  if (def.bureauReports.length > 0) {
    try {
      meterId = await openMeter({ member: caller, def, channel, actor, subjectToken, consentRef });
    } catch (e) {
      console.error("[report] meter could not be opened — refusing:", e);
      return refuse("IX401", "The usage meter is unavailable, so nothing was requested from the bureau. Try again in a moment.");
    }
  }

  // ── 4. Fetch the evidence ─────────────────────────────────────────────────
  let documentJson: Record<string, unknown>;
  let html: string | null = null;
  let billedPulls = 0;
  let sourceLabel = "";
  let replayed = false;
  /** Set when the answer came out of the store rather than off the wire. */
  let servedFromStore = false;
  /** Filled by a LIVE pull, written to the store after the log entry exists —
   *  so a stored pull carries the receipt that proves it. */
  let toStore: { wire: Record<string, unknown>; file: BureauFile; trxIds: string[] } | null = null;
  /** The bureau report numbers that answered — what a bill is for. */
  let answered: number[] = [];

  try {
    if (def.bureauReports.length > 0) {
      // ── THE STORE, BEFORE THE BUREAU ────────────────────────────────────
      // An answer already bought for this subject, by this caller, still inside
      // its retention window IS the answer. Not a cache: two officers opening
      // the same customer an hour apart must see the same file, because the
      // decision was made against this one. It is dated when the BUREAU gave
      // it, and the document says on its face that it was re-served.
      //
      // The gate has already run, so a re-serve is still consented, still
      // metered and still logged. Only the BILL and the bureau round trip are
      // skipped — which is the entire point.
      const stored = await freshPull({ subjectToken, reportType, callerId: caller.id, fresh: body.fresh === true });
      const storedParts = stored
        ? Object.entries(stored.wire)
            .map(([k, v]) => ({ reportType: Number(k), payload: (v ?? {}) as Record<string, unknown> }))
            .filter((x) => Number.isFinite(x.reportType) && x.payload && typeof x.payload === "object")
        : [];

      if (stored && storedParts.length > 0) {
        servedFromStore = true;
        billedPulls = 0;
        const ageDays = Math.floor((Date.now() - stored.pulledAt.getTime()) / 86_400_000);
        sourceLabel =
          `Stored Metropol file · pulled ${stored.pulledAt.toISOString().slice(0, 10)}` +
          ` (${ageDays === 0 ? "today" : `${ageDays} day${ageDays === 1 ? "" : "s"} ago`}) · not re-billed`;

        const file = buildFile(storedParts);
        const doc = bureauCreditFile(
          file,
          {
            member: { code: caller.code, name: caller.name },
            // The person, on the document, when the channel named one.
            requestedBy: actor.name && actor.kind !== "system" ? { person: actor.name, organisation: caller.name, memberCode: caller.code } : null,
            subjectToken,
            consentRef,
            // The pull's own date, not today's. A report that re-dates itself
            // every time it is opened cannot be produced in a dispute.
            generatedAt: stored.pulledAt.toISOString().replace("T", " ").slice(0, 19) + " UTC",
            environment: null,
            source: sourceLabel,
          },
          { reportType: def.type, title: def.name },
        );
        documentJson = {
          ...structuredJson(doc.meta, reportType),
          file,
          quote: quote(reportType, { contributing: true }),
          stored: {
            pulled_at: stored.pulledAt.toISOString(),
            expires_at: stored.expiresAt.toISOString(),
            original_receipt: { seq: stored.logSeq, hash: stored.logHash },
            trx_ids: stored.trxIds,
          },
          ...(includeWire ? { wire: stored.wire } : {}),
        };
        if (format !== "json") html = renderReportHtml(doc);
      } else {
        const answer = replayDir()
          ? ((replayed = true), await pullFromReplay(def.bureauReports))
          : await pullFromContractHolder({
              identityNumber: normaliseNationalId(identityNumber!)!,
              identityType: String(body.identity_type ?? "001"),
              reportTypes: def.bureauReports,
              loanAmount: Number(body.loan_amount ?? 10_000),
              reportReason: Number(body.report_reason ?? 1),
              onBehalfOf: caller.code,
            });

        const ok = answer.pulls.filter((p) => p.ok && p.payload);
        answered = ok.map((p) => p.reportType);
        if (ok.length === 0) {
          const refusal = answer.pulls.find((p) => p.apiCode);
          const upstream = normaliseApiCode(refusal?.apiCode);
          if (meterId) {
            await settleMeter(meterId, {
              state: answer.billed > 0 ? "BILLED" : "NOT_BILLED",
              def,
              servedFrom: replayed ? "replay" : "bureau",
              billedPulls: answer.billed,
              answered: answer.billed > 0 ? def.bureauReports : [],
              detail: refusal?.message ?? `The bureau returned no data${upstream ? ` (${upstream})` : ""}.`,
            });
          }
          // The bureau's own code passes through untouched — E017 means a thin
          // file to every parser written against the bureau, and it must keep
          // meaning that here. Only a refusal with no bureau code becomes IX402.
          //
          // IX402 carries the NODE's own sentence when it gave one. Without it a
          // relay that was simply offline reached the officer as "the bureau
          // answered with an error" — which sent everybody looking at Metropol
          // for a failure that never left the lender's building (22 Sep 2026).
          const why = refusal?.message ?? answer.pulls.find((p) => !p.ok && p.message)?.message ?? undefined;
          if (!upstream) return refuse("IX402", why, { report_type: reportType, subject_token: subjectToken });
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
        const doc = bureauCreditFile(
          file,
          {
            member: { code: caller.code, name: caller.name },
            // The person, on the document, when the channel named one.
            requestedBy: actor.name && actor.kind !== "system" ? { person: actor.name, organisation: caller.name, memberCode: caller.code } : null,
            subjectToken,
            consentRef,
            generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
            environment: replayed ? "REPLAY — NOT A LIVE PULL" : null,
            source: sourceLabel,
          },
          { reportType: def.type, title: def.name },
        );

        // Keyed by the bureau's own report number, and kept VERBATIM — the body
        // exactly as Metropol sent it, not a restructured version.
        const wire = Object.fromEntries(ok.map((x) => [String(x.reportType), x.payload!]));
        documentJson = {
          ...structuredJson(doc.meta, reportType),
          file,
          quote: quote(reportType, { contributing: true }),
          ...(includeWire ? { wire } : {}),
        };
        if (format !== "json") html = renderReportHtml(doc);

        // A REPLAY is never stored. It is a captured answer being re-played for a
        // demo, and putting it in the store would make the next real pull serve a
        // fixture to somebody making a lending decision.
        if (!replayed) toStore = { wire, file, trxIds: file.trxIds ?? [] };
      }
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

      sourceLabel = `${e.responded} member node${e.responded === 1 ? "" : "s"}, brokered by ${caller.code}`;
      const doc = exposureReport(e, {
        member: { code: caller.code, name: caller.name },
        // The person, on the document, when the channel named one.
        requestedBy: actor.name && actor.kind !== "system" ? { person: actor.name, organisation: caller.name, memberCode: caller.code } : null,
        subjectToken,
        consentRef,
        generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
        environment: null,
        source: sourceLabel,
      });

      documentJson = { ...structuredJson(doc.meta, reportType), exposure: e, quote: quote(reportType, { contributing: true }) };
      if (format !== "json") html = renderReportHtml(doc);
    }
  } catch (e) {
    if (e instanceof BureauUnavailable) {
      if (meterId) {
        await settleMeter(meterId, { state: "NOT_BILLED", def, servedFrom: null, billedPulls: 0, answered: [], detail: e.message });
      }
      return refuse(e.reason === "refused" ? "IX403" : "IX401", e.message);
    }
    // Unknown failure after the meter opened: it stays PENDING and priced as
    // billed, because we cannot prove the bureau did not charge.
    throw e;
  }

  // ── 5. Render and log ─────────────────────────────────────────────────────
  const latencyMs = Date.now() - started;
  await prisma.auditEntry.update({ where: { id: decision.auditId }, data: { latencyMs } });

  const responseDigest = createHash("sha256")
    .update(html ?? JSON.stringify(documentJson), "utf8")
    .digest("hex");

  const entry = await append({
    callerCode: caller.code,
    serviceCode: def.code,
    subjectToken,
    consentRef,
    outcome: "GRANTED",
    requestDigest,
    responseDigest,
    callerSignature,
  });

  // ── 6. KEEP IT ────────────────────────────────────────────────────────────
  // After the log entry, never before: a stored pull carries the receipt that
  // proves it, and a row written ahead of the chain could point at an entry that
  // was never appended. Awaited — a floating promise in a function that returns
  // is a write that silently does not happen. It cannot throw.
  let pullId: string | null = null;
  if (toStore) {
    const kept = await recordPull({
      subjectToken,
      callerId: caller.id,
      callerCode: caller.code,
      reportType,
      bureauReports: def.bureauReports,
      consentRef,
      billedPulls,
      latencyMs,
      logSeq: entry.seq,
      logHash: entry.hash,
      trxIds: toStore.trxIds,
      wire: toStore.wire,
      normalised: toStore.file as unknown,
      facet: { kind: "credit", file: toStore.file },
    });
    if (kept.ok) pullId = kept.id;
    else console.error(`[report] pull not stored (type ${reportType}, caller ${caller.code}): ${kept.error}`);
  }

  if (meterId) {
    await settleMeter(meterId, {
      state: servedFromStore ? "RESERVED" : replayed ? "NOT_BILLED" : "BILLED",
      def,
      servedFrom: servedFromStore ? "store" : replayed ? "replay" : "bureau",
      billedPulls,
      answered,
      logSeq: entry.seq,
      pullId,
      detail: sourceLabel,
    });
  }

  const headers: Record<string, string> = {
    "x-interchange-log-seq": entry.seq.toString(),
    "x-interchange-log-hash": entry.hash,
    "x-interchange-response-digest": responseDigest,
    "x-interchange-billed-pulls": String(billedPulls),
    "x-interchange-latency-ms": String(latencyMs),
    "x-interchange-renderer": rendererKind(),
    // Whether the caller paid for this answer or was handed one already bought.
    "x-interchange-served-from": servedFromStore ? "store" : replayed ? "replay" : "bureau",
    ...(meterId ? { "x-interchange-meter": meterId } : {}),
  };

  if (format === "json") {
    return NextResponse.json({ ...documentJson, receipt: { seq: entry.seq.toString(), hash: entry.hash } }, { headers });
  }

  if (format === "html") {
    return new NextResponse(html!, { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
  }

  // ── bundle: the structured file AND the document, from one pull ──────────
  if (format === "bundle") {
    if (!canRenderPdf()) {
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
        document: { media_type: "application/pdf", encoding: "base64", bytes: pdf.length, content: pdf.toString("base64") },
      },
      { headers },
    );
  }

  if (!canRenderPdf()) {
    return refuse("IX603", "PDF rendering is not available on this deployment (no headless browser, and the serverless renderer is switched off). Request format=html, or call the engine host.", {
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
