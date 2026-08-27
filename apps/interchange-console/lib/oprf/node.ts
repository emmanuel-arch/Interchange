// ─────────────────────────────────────────────────────────────────────────────
// The OPRF — member-node side.
//
// This is the code that runs INSIDE a member's perimeter. It is the last place
// a real national ID or MSISDN exists. Everything after it is a token.
//
// The exchange is three steps and one network hop:
//
//   blind(identifier)         → local, produces {blind, blinded}
//   POST /api/oprf/evaluate   → the Registry returns the evaluated element
//   finalize(...)             → local, produces the subject token
//
// The Registry sees only `blinded`, which is a uniformly random point. Two calls
// for the SAME person produce different blinded elements, so the Registry cannot
// even tell it is being asked about the same person twice — while the finalized
// token is identical, which is exactly what makes exposure computable.
// ─────────────────────────────────────────────────────────────────────────────
import { ristretto255_oprf } from "@noble/curves/ed25519.js";
import { bytesToHex } from "./registry";

const { oprf } = ristretto255_oprf;

export type IdentifierKind = "national_id" | "msisdn";

/**
 * Normalise before blinding, or the same person tokenises two different ways and
 * the whole exchange silently stops matching. 0758…, +254758… and 254758… must
 * all land on one token.
 */
export function canonicalIdentifier(kind: IdentifierKind, raw: string): string {
  const trimmed = raw.trim();
  if (kind === "msisdn") {
    const digits = trimmed.replace(/\D/g, "");
    const local = digits.replace(/^(?:254|0)/, "");
    return `msisdn:254${local}`;
  }
  return `national_id:${trimmed.replace(/^0+/, "").toUpperCase()}`;
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.trim().toLowerCase().match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

/**
 * A Kenyan national ID, reduced to the digits that identify the person.
 *
 * ⚠ THIS MUST MATCH THE NODE. `Borrowers.NationalID` in Serviceconnect is free
 * text and holds what a loan officer typed — "12345678", "1234-5678",
 * "12 345 678", "1234567/8". `canonicalIdentifier` deliberately does not touch
 * punctuation, because it is the wire format and changing it would fork every
 * token already issued. So normalisation happens in front of it, on both sides.
 *
 * When the two sides disagreed, the same borrower tokenised one way during an
 * ingest and another way while a query was served, and the two never matched.
 * Nothing logged an error: the exposure query simply answered "no other lender
 * is reporting a loan to you" about somebody three lenders deep.
 *
 * Mirrored in connected-suite/src/lib/interchange/oprf.ts. Change both.
 */
export function normaliseNationalId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 9) return null;
  if (/^0+$/.test(digits)) return null;
  return digits;
}

export class UnusableIdentifier extends Error {
  constructor(kind: IdentifierKind) {
    super(`Not a usable ${kind} — it cannot be tokenised.`);
    this.name = "UnusableIdentifier";
  }
}

/**
 * Pre-normalise, then canonicalise. Every path that derives a token goes through
 * here so ingest and serving cannot drift apart. Idempotent.
 */
export function identifierInput(kind: IdentifierKind, raw: string): string {
  if (kind === "national_id") {
    const clean = normaliseNationalId(raw);
    if (!clean) throw new UnusableIdentifier(kind);
    return canonicalIdentifier(kind, clean);
  }
  return canonicalIdentifier(kind, raw);
}

/** Step 1 — blind locally. `blind` is a secret; it never leaves the node. */
export function blind(kind: IdentifierKind, raw: string) {
  const input = new TextEncoder().encode(identifierInput(kind, raw));
  const { blind: blindScalar, blinded } = oprf.blind(input);
  return { input, blind: blindScalar, blindedHex: bytesToHex(blinded) };
}

/** Step 3 — unblind and finalize into the ecosystem-stable subject token. */
export function finalize(
  input: Uint8Array,
  blindScalar: Uint8Array,
  evaluatedHex: string,
): string {
  return bytesToHex(oprf.finalize(input, blindScalar, hexToBytes(evaluatedHex)));
}

/**
 * The whole exchange, for a node that can reach the Registry.
 *
 * `evaluate` is injected rather than called directly so the same function works
 * against a local Registry, a remote one, or a test double — and so this file
 * has no opinion about transport.
 */
export async function deriveSubjectToken(
  kind: IdentifierKind,
  raw: string,
  evaluate: (blindedHex: string) => Promise<string>,
): Promise<string> {
  const { input, blind: blindScalar, blindedHex } = blind(kind, raw);
  const evaluated = await evaluate(blindedHex);
  return finalize(input, blindScalar, evaluated);
}

/** Short display form. Never render a full token in a console or a log line. */
export function tokenPreview(token: string): string {
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

/** OPRF output is 64 bytes → 128 hex characters. */
export const SUBJECT_TOKEN_HEX_LENGTH = 128;

export function isSubjectToken(value: string): boolean {
  return new RegExp(`^[0-9a-f]{${SUBJECT_TOKEN_HEX_LENGTH}}$`, "i").test(value);
}
