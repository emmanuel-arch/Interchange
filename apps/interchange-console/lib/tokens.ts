// ─────────────────────────────────────────────────────────────────────────────
// The tokenisation boundary.
//
// Nothing downstream of this file — the Registry, the audit log, Kafka, the
// lake, the AI tools — may ever see a national ID or an MSISDN. Identity stops
// here and `subjectToken` continues.
//
// ⚠ THIS IS NOT THE PRODUCTION TOKENISER. Blueprint v2 §4.1 specifies an
// oblivious PRF (RFC 9497 over ristretto255) run by the Registry: the member
// blinds the identifier, the Registry applies the ecosystem secret without ever
// seeing it, the member unblinds. That construction is what makes offline
// enumeration impossible — and it matters, because Kenyan national IDs are an
// eight-digit space. Anyone holding a plain shared secret can walk all 100M of
// them in hours and rebuild the identity map.
//
// What is below is a keyed HMAC placeholder so Sprint 1 has stable, matching
// tokens to develop against. It has exactly that weakness, which is why the
// secret is dev-only and why the real OPRF is the first thing in Sprint 2.
// ─────────────────────────────────────────────────────────────────────────────
import { createHmac } from "crypto";

/** Normalise before hashing, or the same person tokenises two different ways. */
function normalise(kind: "national_id" | "msisdn", raw: string): string {
  const trimmed = raw.trim();
  if (kind === "msisdn") {
    // 0758…, +254758…, 254758… must all land on the same token.
    const digits = trimmed.replace(/\D/g, "");
    const local = digits.replace(/^(?:254|0)/, "");
    return `msisdn:254${local}`;
  }
  return `national_id:${trimmed.replace(/^0+/, "").toUpperCase()}`;
}

function secret(): string {
  const s = process.env.INTERCHANGE_OPRF_DEV_SECRET;
  if (!s) {
    throw new Error(
      "[tokens] INTERCHANGE_OPRF_DEV_SECRET is not set. Refusing to tokenise — " +
        "an unkeyed token would be a plain hash of a national ID, which is trivially reversible.",
    );
  }
  return s;
}

/**
 * Derive the ecosystem-stable token for an identifier.
 *
 * Call this at the EDGE — inside the member's node, before anything crosses a
 * boundary. Never call it in the Registry on a raw identifier a member sent
 * you: that would mean the raw identifier already crossed, and the boundary has
 * already been breached.
 */
export function subjectToken(
  kind: "national_id" | "msisdn",
  raw: string,
): string {
  return createHmac("sha256", secret())
    .update(normalise(kind, raw))
    .digest("hex");
}

/** Short display form for consoles and logs. Never show a full token in a UI. */
export function tokenPreview(token: string): string {
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}
