// ─────────────────────────────────────────────────────────────────────────────
// The OPRF — Registry side.
//
// RFC 9497 OPRF over ristretto255, which is what blueprint v2 §4.1 specifies.
// The member sends a BLINDED element; this evaluates it under the ecosystem
// secret and sends it back. The Registry never learns the identifier, and the
// member never learns the key.
//
// Why not a shared HMAC secret, which is simpler and what Sprint 1 used: Kenyan
// national IDs are an eight-digit space. Anyone holding a shared secret can walk
// all hundred million of them offline in hours and rebuild the entire identity
// map. The OPRF makes that impossible — tokens cannot be computed without
// talking to the Registry.
//
// Which moves the attack online, and that is what `assertIssuanceWithinLimit`
// is for. A member that can ask a hundred million times still enumerates the
// space; a member capped at a few thousand a day does not.
//
// ⚠ KEY CUSTODY. In production the ecosystem key belongs in a KMS or an HSM and
// must never be readable by the application process. Rotating it re-tokenises
// the entire ecosystem, so it is effectively unrotatable once data exists — plan
// for that before launch, not after.
// ─────────────────────────────────────────────────────────────────────────────
import { ristretto255_oprf } from "@noble/curves/ed25519.js";
import { prisma } from "@/lib/prisma";

const { oprf } = ristretto255_oprf;

/** Default daily issuance cap per member. Deliberately low — see the note above. */
export const DEFAULT_DAILY_ISSUANCE = 5_000;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("Not valid hex.");
  }
  return Uint8Array.from(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function ecosystemKey(): Uint8Array {
  const hex = process.env.INTERCHANGE_OPRF_KEY;
  if (!hex) {
    throw new Error(
      "[oprf] INTERCHANGE_OPRF_KEY is not set. Refusing to evaluate — generating " +
        "a key on the fly would mint tokens that never match anything issued before.",
    );
  }
  const key = hexToBytes(hex);
  if (key.length !== 32) {
    throw new Error(`[oprf] INTERCHANGE_OPRF_KEY must be 32 bytes; got ${key.length}.`);
  }
  return key;
}

/**
 * Derive a token directly, for a holder of the ecosystem key (seeders, fixtures).
 *
 * A NODE cannot do this and must go through the blinded exchange — that is the
 * entire security property. This runs the same blind/evaluate/finalize steps
 * locally, which yields an identical token to the round trip.
 */
export function evaluateDirect(keyHex: string, input: Uint8Array): string {
  const key = hexToBytes(keyHex);
  const { blind, blinded } = oprf.blind(input);
  const evaluated = oprf.blindEvaluate(key, blinded);
  return bytesToHex(oprf.finalize(input, blind, evaluated));
}

/** Generate a fresh ecosystem key. Run once, ever, then guard it. */
export function generateEcosystemKey(): { secretKey: string; publicKey: string } {
  const kp = oprf.generateKeyPair();
  return { secretKey: bytesToHex(kp.secretKey), publicKey: bytesToHex(kp.publicKey) };
}

export class IssuanceLimitExceeded extends Error {
  constructor(public readonly limit: number) {
    super(`OPRF issuance limit of ${limit}/day exceeded.`);
  }
}

/**
 * Count this member's evaluations in the last 24h and refuse past the cap.
 *
 * Recorded BEFORE evaluating, so a crash mid-request costs the member a slot
 * rather than giving them a free one. Under-counting an enumeration attempt is
 * worse than over-counting a legitimate call.
 */
export async function assertIssuanceWithinLimit(
  memberId: string,
  limit = DEFAULT_DAILY_ISSUANCE,
): Promise<{ used: number; limit: number }> {
  const since = new Date(Date.now() - 86_400_000);
  const used = await prisma.oprfIssuance.count({ where: { memberId, at: { gte: since } } });
  if (used >= limit) throw new IssuanceLimitExceeded(limit);
  await prisma.oprfIssuance.create({ data: { memberId } });
  return { used: used + 1, limit };
}

/**
 * Evaluate a blinded element under the ecosystem key.
 *
 * `blindedHex` is a ristretto255 point the member produced by blinding their
 * identifier. It carries no information about the identifier itself.
 */
export function blindEvaluate(blindedHex: string): string {
  const blinded = hexToBytes(blindedHex);
  if (blinded.length !== 32) {
    throw new Error(`[oprf] blinded element must be 32 bytes; got ${blinded.length}.`);
  }
  return bytesToHex(oprf.blindEvaluate(ecosystemKey(), blinded));
}
