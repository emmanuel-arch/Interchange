// ─────────────────────────────────────────────────────────────────────────────
// The hard gate. No consent_ref, no answer.
//
// This is the single chokepoint every Interchange call passes through. It is
// deliberately the only way to authorise an operation, and it always writes an
// audit row — including, especially, when it refuses. A refusal that leaves no
// trace is indistinguishable from a call that never happened, and the whole
// promise to members is that they can see who asked about their customers.
//
// AGENTS.md rule 1: enforce this in the handler, never in a prompt or a comment.
// If you are adding a new service and find yourself reaching for the database
// without calling authorise() first, that is the bug.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { coversScopes, missingScopes } from "./scopes";
import type { CallOutcome } from "@prisma/client";

export type AuthoriseInput = {
  /** The member making the call. Resolved from their certificate — NEVER from the request body. */
  callerId: string;
  serviceCode: string;
  subjectToken: string;
  consentRef?: string | null;
};

export type AuthoriseResult =
  | { ok: true; consentId: string; auditId: string }
  | { ok: false; outcome: Exclude<CallOutcome, "GRANTED">; reason: string; auditId: string };

/**
 * Decide whether this call may proceed, and record the decision.
 *
 * Order matters: reciprocity is checked before consent, because "you are not
 * contributing" is about the caller and can be answered without touching a
 * borrower's record at all. Consent lookups are the more sensitive read, so we
 * do the cheapest, least invasive check first.
 */
export async function authorise(input: AuthoriseInput): Promise<AuthoriseResult> {
  const { callerId, serviceCode, subjectToken, consentRef } = input;

  const service = await prisma.service.findUnique({ where: { code: serviceCode } });
  if (!service) {
    throw new Error(`[gate] Unknown service "${serviceCode}" — it is not in the Directory.`);
  }

  const caller = await prisma.member.findUnique({ where: { id: callerId } });
  if (!caller) {
    throw new Error(`[gate] Unknown caller ${callerId}.`);
  }

  const record = async (
    outcome: CallOutcome,
    detail: string | null,
    ref: string | null,
  ) =>
    prisma.auditEntry.create({
      data: {
        callerId,
        serviceId: service.id,
        subjectToken,
        consentRef: ref,
        outcome,
        detail,
      },
      select: { id: true },
    });

  // ── 1. Reciprocity ────────────────────────────────────────────────────────
  // A member in SHADOW contributes but may not query. A SUSPENDED member has
  // stopped contributing. Both are refusals the policy engine makes on its own,
  // with no contract renegotiation and no human in the loop.
  const inShadow = caller.shadowUntil !== null && caller.shadowUntil > new Date();
  if (caller.status !== "ACTIVE" || inShadow) {
    const reason =
      caller.status === "SHADOW" || inShadow
        ? "Member is in the shadow period: contributing, not yet querying."
        : `Member status is ${caller.status}.`;
    const audit = await record("REFUSED_RECIPROCITY", reason, consentRef ?? null);
    return { ok: false, outcome: "REFUSED_RECIPROCITY", reason, auditId: audit.id };
  }

  // ── 2. Quota ──────────────────────────────────────────────────────────────
  // The commercial model is per-query above a contribution-linked free tier, so
  // the free tier has to be countable. Only GRANTED calls count: charging a
  // member for a refusal would let one member burn another's allowance by
  // asking about their customers.
  const subscription = await prisma.subscription.findFirst({
    where: { memberId: callerId, serviceId: service.id, active: true },
    select: { freeTierPerDay: true },
  });

  if (!subscription) {
    const reason = `Not subscribed to ${serviceCode}.`;
    const audit = await record("REFUSED_QUOTA", reason, consentRef ?? null);
    return { ok: false, outcome: "REFUSED_QUOTA", reason, auditId: audit.id };
  }

  if (subscription.freeTierPerDay > 0) {
    const usedToday = await prisma.auditEntry.count({
      where: {
        callerId,
        serviceId: service.id,
        outcome: "GRANTED",
        at: { gte: new Date(Date.now() - 86_400_000) },
      },
    });
    if (usedToday >= subscription.freeTierPerDay) {
      const reason = `Free tier of ${subscription.freeTierPerDay}/day exhausted.`;
      const audit = await record("REFUSED_QUOTA", reason, consentRef ?? null);
      return { ok: false, outcome: "REFUSED_QUOTA", reason, auditId: audit.id };
    }
  }

  // ── 3. Consent must exist ─────────────────────────────────────────────────
  if (!consentRef) {
    const reason = "No consent_ref presented.";
    const audit = await record("REFUSED_NO_CONSENT", reason, null);
    return { ok: false, outcome: "REFUSED_NO_CONSENT", reason, auditId: audit.id };
  }

  const consent = await prisma.consent.findUnique({ where: { ref: consentRef } });

  if (!consent) {
    const reason = "consent_ref is not known to the Registry.";
    const audit = await record("REFUSED_NO_CONSENT", reason, consentRef);
    return { ok: false, outcome: "REFUSED_NO_CONSENT", reason, auditId: audit.id };
  }

  // The ref must belong to the person being asked about. Without this check a
  // caller could present any valid consent to unlock any borrower — the single
  // most likely way this gate would be defeated in practice.
  if (consent.subjectToken !== subjectToken) {
    const reason = "consent_ref belongs to a different subject.";
    const audit = await record("REFUSED_NO_CONSENT", reason, consentRef);
    return { ok: false, outcome: "REFUSED_NO_CONSENT", reason, auditId: audit.id };
  }

  if (consent.revokedAt) {
    const reason = "Consent was revoked.";
    await prisma.consentEvent.create({
      data: { consentId: consent.id, kind: "REFUSED_REVOKED", actorMemberId: callerId, serviceCode, detail: reason },
    });
    const audit = await record("REFUSED_NO_CONSENT", reason, consentRef);
    return { ok: false, outcome: "REFUSED_NO_CONSENT", reason, auditId: audit.id };
  }

  if (consent.expiresAt <= new Date()) {
    const reason = "Consent has expired.";
    await prisma.consentEvent.create({
      data: { consentId: consent.id, kind: "EXPIRED", actorMemberId: callerId, serviceCode, detail: reason },
    });
    const audit = await record("REFUSED_NO_CONSENT", reason, consentRef);
    return { ok: false, outcome: "REFUSED_NO_CONSENT", reason, auditId: audit.id };
  }

  // ── 4. Scope must cover the operation ─────────────────────────────────────
  if (!coversScopes(consent.scopes, service.requiredScopes)) {
    const missing = missingScopes(consent.scopes, service.requiredScopes);
    const reason = `Consent does not cover: ${missing.join(", ")}.`;
    await prisma.consentEvent.create({
      data: { consentId: consent.id, kind: "REFUSED_SCOPE", actorMemberId: callerId, serviceCode, detail: reason },
    });
    const audit = await record("REFUSED_SCOPE", reason, consentRef);
    return { ok: false, outcome: "REFUSED_SCOPE", reason, auditId: audit.id };
  }

  // ── Granted ───────────────────────────────────────────────────────────────
  await prisma.consentEvent.create({
    data: { consentId: consent.id, kind: "VALIDATED", actorMemberId: callerId, serviceCode },
  });
  const audit = await record("GRANTED", null, consentRef);
  return { ok: true, consentId: consent.id, auditId: audit.id };
}
