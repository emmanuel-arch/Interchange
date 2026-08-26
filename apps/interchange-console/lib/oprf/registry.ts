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

/** Default daily issuance cap per member, for SERVING. Deliberately low — see above. */
export const DEFAULT_DAILY_ISSUANCE = 5_000;

/**
 * The separate allowance a node spends tokenising ITS OWN book.
 *
 * Why this is a second number rather than a bigger first one: the serving cap
 * exists because a member asking about ten thousand strangers is indistinguishable
 * from enumeration. A member tokenising their own borrowers is a different act —
 * but the Registry CANNOT VERIFY THE DIFFERENCE, because by construction it never
 * sees the identifiers. So it is not verified, it is GRANTED: an operator sets it
 * from the member's declared book size, it is spent visibly under kind=INGEST, and
 * an ingest that suddenly wants five times the member's book size shows up in the
 * audit as exactly that.
 *
 * Sized for the founding cohort's largest live entity with headroom for a full
 * re-tokenisation: Axe - Boresha carries ~14k open loans, Micromart Africa ~59k.
 */
export const DEFAULT_DAILY_INGEST = 250_000;

export type IssuanceKind = "SERVING" | "INGEST";

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
  constructor(
    public readonly limit: number,
    public readonly kind: IssuanceKind,
  ) {
    super(`OPRF ${kind.toLowerCase()} issuance limit of ${limit}/day exceeded.`);
  }
}

/** The cap for one kind, env-overridable so an operator can grant a member more. */
export function issuanceLimitFor(kind: IssuanceKind): number {
  const raw =
    kind === "INGEST" ? process.env.INTERCHANGE_DAILY_INGEST : process.env.INTERCHANGE_DAILY_ISSUANCE;
  const n = raw != null ? Number(raw) : NaN;
  if (Number.isInteger(n) && n > 0) return n;
  return kind === "INGEST" ? DEFAULT_DAILY_INGEST : DEFAULT_DAILY_ISSUANCE;
}

/**
 * Sum this member's evaluations of one kind in the last 24h and refuse past the cap.
 *
 * Recorded BEFORE evaluating, so a crash mid-request costs the member the slots
 * rather than giving them away free. Under-counting an enumeration attempt is
 * worse than over-counting a legitimate call.
 *
 * The check is on SUM(count), not on the number of rows — otherwise a member
 * could ask for the whole national ID space in one batch and spend a single slot.
 */
export async function assertIssuanceWithinLimit(
  memberId: string,
  elements = 1,
  kind: IssuanceKind = "SERVING",
  limit = issuanceLimitFor(kind),
): Promise<{ used: number; limit: number; kind: IssuanceKind }> {
  const since = new Date(Date.now() - 86_400_000);
  const agg = await prisma.oprfIssuance.aggregate({
    where: { memberId, kind, at: { gte: since } },
    _sum: { count: true },
  });
  const used = agg._sum.count ?? 0;
  if (used + elements > limit) throw new IssuanceLimitExceeded(limit, kind);
  await prisma.oprfIssuance.create({ data: { memberId, count: elements, kind } });
  return { used: used + elements, limit, kind };
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
