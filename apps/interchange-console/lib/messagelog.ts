// ─────────────────────────────────────────────────────────────────────────────
// The message log — append-only and hash-chained.
//
// Each entry commits to the one before it, so the chain has a property an
// ordinary audit table does not: you cannot remove or edit an entry without
// breaking every hash after it. That is what turns "our logs say X" into
// something a member can actually rely on when the dispute is with US.
//
// CONCURRENCY. A hash chain has exactly one writer at a time or it is not a
// chain — two concurrent appends reading the same head would both claim the same
// prevHash and fork it. Appends therefore take a Postgres advisory lock for the
// life of the transaction. It serialises writes, which is the point; if this
// ever becomes the bottleneck the answer is one chain per member, not a weaker
// lock.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/** Arbitrary but fixed: the advisory-lock key for the single global chain. */
const CHAIN_LOCK_KEY = 0x1c7a_1096;

export const GENESIS_PREV_HASH = "0".repeat(64);

export type AppendInput = {
  callerCode: string;
  serviceCode: string;
  subjectToken: string;
  consentRef: string | null;
  outcome: string;
  requestDigest: string;
  responseDigest?: string | null;
  callerSignature?: string | null;
};

/**
 * The bytes an entry's hash commits to. Field order is fixed and must never
 * change — a reordering silently invalidates every historical verification.
 */
function payload(seq: bigint, at: Date, e: AppendInput): string {
  return [
    seq.toString(),
    at.toISOString(),
    e.callerCode,
    e.serviceCode,
    e.subjectToken,
    e.consentRef ?? "",
    e.outcome,
    e.requestDigest,
    e.responseDigest ?? "",
    e.callerSignature ?? "",
  ].join(""); // ASCII unit separator — cannot occur in any field above.
  // Joining on "" would make the encoding ambiguous: "ab"+"c" and "a"+"bc"
  // produce identical bytes, so two different exchanges could hash the same.
  // The separator is what makes it injective.
}

export function entryHash(prevHash: string, seq: bigint, at: Date, e: AppendInput): string {
  return createHash("sha256").update(prevHash).update(payload(seq, at, e)).digest("hex");
}

export async function append(e: AppendInput) {
  return prisma.$transaction(async (tx) => {
    // Held until the transaction ends. Every appender queues behind it.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;

    const head = await tx.messageLogEntry.findFirst({
      orderBy: { seq: "desc" },
      select: { seq: true, hash: true },
    });

    const seq = (head?.seq ?? BigInt(0)) + BigInt(1);
    const prevHash = head?.hash ?? GENESIS_PREV_HASH;
    const at = new Date();
    const hash = entryHash(prevHash, seq, at, e);

    return tx.messageLogEntry.create({
      data: {
        seq,
        at,
        prevHash,
        hash,
        callerCode: e.callerCode,
        serviceCode: e.serviceCode,
        subjectToken: e.subjectToken,
        consentRef: e.consentRef,
        outcome: e.outcome,
        requestDigest: e.requestDigest,
        responseDigest: e.responseDigest ?? null,
        callerSignature: e.callerSignature ?? null,
      },
    });
  });
}

export type VerifyReport = {
  ok: boolean;
  checked: number;
  brokenAt: bigint | null;
  reason: string | null;
};

/**
 * Walk the chain and re-derive every hash.
 *
 * This is the function that makes the log worth having. A chain nobody verifies
 * is just a table with an extra column — so this ships as a runnable check, not
 * as a claim in a document.
 */
export async function verifyChain(limit?: number): Promise<VerifyReport> {
  const entries = await prisma.messageLogEntry.findMany({
    orderBy: { seq: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  let expectedPrev = GENESIS_PREV_HASH;
  let expectedSeq = BigInt(1);

  for (const entry of entries) {
    if (entry.seq !== expectedSeq) {
      return {
        ok: false,
        checked: Number(expectedSeq - BigInt(1)),
        brokenAt: entry.seq,
        reason: `Sequence gap: expected ${expectedSeq}, found ${entry.seq}. An entry was removed.`,
      };
    }
    if (entry.prevHash !== expectedPrev) {
      return {
        ok: false,
        checked: Number(expectedSeq - BigInt(1)),
        brokenAt: entry.seq,
        reason: "prevHash does not match the previous entry's hash.",
      };
    }
    const recomputed = entryHash(entry.prevHash, entry.seq, entry.at, {
      callerCode: entry.callerCode,
      serviceCode: entry.serviceCode,
      subjectToken: entry.subjectToken,
      consentRef: entry.consentRef,
      outcome: entry.outcome,
      requestDigest: entry.requestDigest,
      responseDigest: entry.responseDigest,
      callerSignature: entry.callerSignature,
    });
    if (recomputed !== entry.hash) {
      return {
        ok: false,
        checked: Number(expectedSeq - BigInt(1)),
        brokenAt: entry.seq,
        reason: "Entry contents do not match its hash — the row was edited.",
      };
    }
    expectedPrev = entry.hash;
    expectedSeq += BigInt(1);
  }

  return { ok: true, checked: entries.length, brokenAt: null, reason: null };
}
