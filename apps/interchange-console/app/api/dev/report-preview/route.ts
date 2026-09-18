// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dev/report-preview?id=<national id>&type=12&format=html
//
// A browser cannot produce an Ed25519 signature over a canonical request, and it
// must not hold a member's private key to try. So this dev-only route acts as
// the member's NODE on the server side: it signs with the key in
// .member-keys.json, calls the real /api/v1/report, and streams back whatever
// that returns.
//
// ⚠ It is a DEVELOPMENT SURFACE and is fenced behind the same flag as
// /api/session/dev. In production the console talks to a member's own node, and
// the node holds the key inside the member's perimeter. Nothing here is a
// shortcut that survives to production — it exists so the endpoint can be SEEN
// working, end to end, through the same gate a member goes through.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { prisma } from "@/lib/prisma";
import { signRequest } from "@/lib/signing";
import { identifierInput, normaliseNationalId } from "@/lib/oprf/node";
import { evaluateDirect } from "@/lib/oprf/registry";
import { MANDATORY_SCOPES } from "@/lib/consent/scopes";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEV = process.env.NODE_ENV !== "production" && process.env.INTERCHANGE_DEV_OPEN_CONSOLE === "1";

function selfUrl(): string {
  return (process.env.INTERCHANGE_SELF_URL ?? "http://127.0.0.1:3341").replace(/\/+$/, "");
}

export async function GET(request: Request) {
  if (!DEV) {
    return NextResponse.json({ error: "This preview runs only in development." }, { status: 404 });
  }

  const url = new URL(request.url);
  const rawId = url.searchParams.get("id") ?? "";
  const reportType = Number(url.searchParams.get("type") ?? 12);
  const format = url.searchParams.get("format") ?? "html";
  const memberCode = url.searchParams.get("member") ?? "KE/LENDER/3005";

  const identityNumber = normaliseNationalId(rawId);
  if (!identityNumber) {
    return NextResponse.json({ error: "Give a national ID: ?id=30058967" }, { status: 400 });
  }

  let secretKey: string;
  try {
    const keys = JSON.parse(readFileSync(".member-keys.json", "utf8")) as Record<string, { secretKey: string }>;
    secretKey = keys[memberCode].secretKey;
  } catch {
    return NextResponse.json(
      { error: `No development key for ${memberCode} in .member-keys.json.` },
      { status: 500 },
    );
  }

  // The token is derived here the way the Registry derives it, so the consent
  // this preview mints is attached to exactly the subject the report endpoint
  // will resolve from the same identifier.
  const ecosystemKey = process.env.INTERCHANGE_OPRF_KEY;
  if (!ecosystemKey) return NextResponse.json({ error: "INTERCHANGE_OPRF_KEY is not set." }, { status: 503 });

  const subjectToken = evaluateDirect(
    ecosystemKey,
    new TextEncoder().encode(identifierInput("national_id", identityNumber)),
  );

  // Reuse a live consent for this subject if one exists, rather than minting a
  // new row on every page view — a consent ledger full of preview artefacts is
  // a consent ledger nobody trusts.
  const existing = await prisma.consent.findFirst({
    where: { subjectToken, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { capturedAt: "desc" },
    select: { ref: true },
  });

  let consentRef = existing?.ref ?? null;
  if (!consentRef) {
    const consentBody = JSON.stringify({
      subject_token: subjectToken,
      member_code: memberCode,
      scopes: MANDATORY_SCOPES,
      captured_via: "LMS_CONSOLE",
      evidence: { surface: "console/reports preview", capturedAt: new Date().toISOString() },
    });
    const res = await fetch(`${selfUrl()}/api/consent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...signRequest({ method: "POST", path: "/api/consent", body: consentBody, memberCode, secretKeyHex: secretKey }),
      },
      body: consentBody,
    });
    const j = (await res.json()) as { consent_ref?: string; message?: string; error?: string };
    if (!j.consent_ref) {
      return NextResponse.json({ error: j.error ?? "Consent could not be issued.", detail: j.message }, { status: 502 });
    }
    consentRef = j.consent_ref;
  }

  const path = "/api/v1/report";
  const body = JSON.stringify({
    report_type: reportType,
    identity_number: identityNumber,
    consent_ref: consentRef,
    format,
  });
  const headers = signRequest({ method: "POST", path, body, memberCode, secretKeyHex: secretKey });

  const res = await fetch(`${selfUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

  const type = res.headers.get("content-type") ?? "application/json";
  const buf = Buffer.from(await res.arrayBuffer());
  return new NextResponse(new Uint8Array(buf), {
    status: res.status,
    headers: {
      "content-type": type,
      "x-interchange-log-seq": res.headers.get("x-interchange-log-seq") ?? "",
      "x-interchange-billed-pulls": res.headers.get("x-interchange-billed-pulls") ?? "",
    },
  });
}
