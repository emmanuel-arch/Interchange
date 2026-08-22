// ─────────────────────────────────────────────────────────────────────────────
// Member onboarding — PROSPECT → SHADOW → ACTIVE, without hand-editing rows.
//
// The founding cohort was admitted by hand. That is fine for three members and
// impossible for thirty, and a network only its operator can add members to is
// not a network — it is a customer list with extra steps.
//
// THE SHADOW PERIOD IS THE HEART OF THIS. A new member contributes for weeks
// before they may query. It does two things at once: it proves their feed is
// accurate before anyone relies on it, and it establishes reciprocity as
// something they lived rather than something they signed. Members who query
// from day one never build the contribution habit — the free tier feels like a
// product, not a bargain, and when contribution lapses nobody notices.
//
// Promotion out of shadow is EARNED and CHECKED, not scheduled. Time served is
// necessary but not sufficient: a member who sat out the period publishing
// nothing has demonstrated the opposite of what the period is for.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { verifyRequest } from "@/lib/signing";

export const SHADOW_PERIOD_DAYS = 28;

/** Minimum evidence of a live book before a member may query. */
export const PROMOTION_REQUIREMENTS = {
  minLoansPublished: 100,
  maxDaysSinceContribution: 7,
};

export type ApplyInput = {
  organisation: string;
  contactName: string;
  contactEmail: string;
  sourceHost?: string;
  sourceDatabase?: string;
  sourceEntityId?: number;
  claimedBorrowers?: number;
  claimedLoans?: number;
};

export async function apply(input: ApplyInput) {
  return prisma.memberApplication.create({
    data: {
      organisation: input.organisation.trim(),
      contactName: input.contactName.trim(),
      contactEmail: input.contactEmail.trim().toLowerCase(),
      sourceHost: input.sourceHost ?? null,
      sourceDatabase: input.sourceDatabase ?? null,
      sourceEntityId: input.sourceEntityId ?? null,
      claimedBorrowers: input.claimedBorrowers ?? 0,
      claimedLoans: input.claimedLoans ?? 0,
    },
  });
}

/**
 * Register the applicant's public key.
 *
 * The request must be SIGNED with the key being registered. That turns the
 * registration from "here is a string" into proof of possession — otherwise
 * anyone could register a key they do not hold against someone else's
 * application, and every signature that key later produced would be attributed
 * to the wrong organisation.
 */
export async function registerKey(
  applicationId: string,
  publicKeyHex: string,
  proof: { method: string; path: string; body: string; headers: Headers },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const application = await prisma.memberApplication.findUnique({ where: { id: applicationId } });
  if (!application) return { ok: false, reason: "Unknown application." };
  if (application.status !== "SUBMITTED" && application.status !== "KEY_REGISTERED") {
    return { ok: false, reason: `Application is ${application.status}.` };
  }

  const verified = verifyRequest({ ...proof, publicKeyHex });
  if (!verified.ok) {
    return {
      ok: false,
      reason: `Key possession not proved: ${verified.message}`,
    };
  }

  await prisma.memberApplication.update({
    where: { id: applicationId },
    data: { publicKey: publicKeyHex, status: "KEY_REGISTERED" },
  });
  return { ok: true };
}

/**
 * Admit an applicant. Creates the Member in SHADOW — never straight to ACTIVE.
 *
 * There is deliberately no path that admits directly to ACTIVE, including for
 * the operator. An exception made once becomes the norm, and the shadow period
 * only means something if it has no exceptions.
 */
export async function admit(applicationId: string, decidedBy: string, rationale: string) {
  const application = await prisma.memberApplication.findUniqueOrThrow({ where: { id: applicationId } });

  if (!application.publicKey) {
    throw new Error("Cannot admit an applicant who has not proved key possession.");
  }
  if (application.status === "ADMITTED") {
    throw new Error("Already admitted.");
  }

  const seq = (await prisma.member.count()) + 1;
  const code = `KE/LENDER/${String(application.sourceEntityId ?? 9000 + seq).padStart(4, "0")}`;

  const member = await prisma.member.create({
    data: {
      code,
      name: application.organisation,
      status: "SHADOW",
      publicKey: application.publicKey,
      keyRegisteredAt: new Date(),
      sourceHost: application.sourceHost,
      sourceDatabase: application.sourceDatabase,
      sourceEntityId: application.sourceEntityId,
      shadowUntil: new Date(Date.now() + SHADOW_PERIOD_DAYS * 86_400_000),
      joinedAt: new Date(),
    },
  });

  await prisma.memberApplication.update({
    where: { id: applicationId },
    data: { status: "ADMITTED", decidedAt: new Date(), decidedBy, decisionNote: rationale, memberId: member.id },
  });

  await prisma.governanceAction.create({
    data: { action: "ADMIT", memberCode: code, applicationId, decidedBy, rationale },
  });

  return member;
}

export async function reject(applicationId: string, decidedBy: string, rationale: string) {
  await prisma.memberApplication.update({
    where: { id: applicationId },
    data: { status: "REJECTED", decidedAt: new Date(), decidedBy, decisionNote: rationale },
  });
  await prisma.governanceAction.create({
    data: { action: "REJECT", applicationId, decidedBy, rationale },
  });
}

export type PromotionCheck = {
  memberCode: string;
  eligible: boolean;
  servedPeriod: boolean;
  contributesEnough: boolean;
  contributesRecently: boolean;
  reason: string;
};

/**
 * Which shadow members have earned promotion?
 *
 * Reports the reasons rather than a bare boolean, because a member who has been
 * waiting a month deserves to be told which of the three conditions they have
 * not met — and because "computer says no" is exactly the failure mode a
 * member-governed network cannot afford.
 */
export async function promotionCandidates(): Promise<PromotionCheck[]> {
  const shadows = await prisma.member.findMany({ where: { status: "SHADOW" } });
  const now = Date.now();

  return shadows.map((m) => {
    const servedPeriod = !m.shadowUntil || m.shadowUntil.getTime() <= now;
    const contributesEnough = m.loans >= PROMOTION_REQUIREMENTS.minLoansPublished;
    const days = m.lastContributionAt
      ? (now - m.lastContributionAt.getTime()) / 86_400_000
      : Infinity;
    const contributesRecently = days <= PROMOTION_REQUIREMENTS.maxDaysSinceContribution;

    const missing: string[] = [];
    if (!servedPeriod) {
      const left = Math.ceil(((m.shadowUntil?.getTime() ?? now) - now) / 86_400_000);
      missing.push(`${left} more day(s) of shadow period`);
    }
    if (!contributesEnough) missing.push(`only ${m.loans} loans published, needs ${PROMOTION_REQUIREMENTS.minLoansPublished}`);
    if (!contributesRecently) {
      missing.push(
        days === Infinity
          ? "has never published"
          : `last contribution ${Math.floor(days)}d ago, needs within ${PROMOTION_REQUIREMENTS.maxDaysSinceContribution}d`,
      );
    }

    return {
      memberCode: m.code,
      eligible: servedPeriod && contributesEnough && contributesRecently,
      servedPeriod,
      contributesEnough,
      contributesRecently,
      reason: missing.length ? missing.join("; ") : "All conditions met.",
    };
  });
}

export async function promote(memberCode: string, decidedBy: string) {
  const checks = await promotionCandidates();
  const check = checks.find((c) => c.memberCode === memberCode);
  if (!check) throw new Error(`${memberCode} is not in the shadow period.`);
  if (!check.eligible) throw new Error(`${memberCode} has not met the conditions: ${check.reason}`);

  const member = await prisma.member.update({
    where: { code: memberCode },
    data: { status: "ACTIVE", shadowUntil: null },
  });

  await prisma.governanceAction.create({
    data: {
      action: "PROMOTE_FROM_SHADOW",
      memberCode,
      decidedBy,
      rationale: "Shadow period served and contribution verified.",
    },
  });

  return member;
}

/**
 * Suspend a member who has stopped contributing.
 *
 * Runs on a schedule. Reciprocity that is only enforced when somebody
 * remembers to check is not enforced — the whole point of binding access to
 * contribution in code is that it happens without a meeting.
 */
export async function suspendLapsed(maxDays = 60, decidedBy = "policy-engine") {
  const cutoff = new Date(Date.now() - maxDays * 86_400_000);
  const lapsed = await prisma.member.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ lastContributionAt: null }, { lastContributionAt: { lt: cutoff } }],
    },
    select: { code: true, lastContributionAt: true },
  });

  for (const m of lapsed) {
    await prisma.member.update({ where: { code: m.code }, data: { status: "SUSPENDED" } });
    await prisma.governanceAction.create({
      data: {
        action: "SUSPEND",
        memberCode: m.code,
        decidedBy,
        rationale: m.lastContributionAt
          ? `No contribution since ${m.lastContributionAt.toISOString().slice(0, 10)} (limit ${maxDays}d).`
          : `Never contributed (limit ${maxDays}d).`,
      },
    });
  }

  return lapsed.map((m) => m.code);
}
