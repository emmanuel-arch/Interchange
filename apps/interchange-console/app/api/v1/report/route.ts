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
import { prisma } from "@/lib/prisma";
import { verifyRequest } from "@/lib/signing";
import { fail, refuse, serveReport } from "@/lib/reports/serve";
import { actorFrom, channelFrom } from "@/lib/meter";
import type { IxCodeKey } from "@/lib/codes/interchange";

export const runtime = "nodejs";
/** A bureau pull is several serial third-party calls; the default 10s is not enough. */
export const maxDuration = 120;

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

  // ── 2–6. Subject, gate, meter, fetch, log, keep — lib/reports/serve.ts ────
  // The member names which of its own surfaces asked (`channel`) and who
  // (`requested_by`). Both ride inside the signed body, so the attribution on
  // the meter is the member's own signed statement about its own staff.
  const channel = channelFrom(body.channel);
  return serveReport({
    caller: caller!,
    body,
    requestDigest: verified.digest,
    callerSignature: verified.signature,
    channel,
    actor: actorFrom(body.requested_by, channel),
    started,
  });
}
