// ─────────────────────────────────────────────────────────────────────────────
// WHERE A MEMBER'S CRUNCH POLICY LIVES.
//
// ── THE ONE RULE ─────────────────────────────────────────────────────────────
// A crunch NEVER fails because the settings could not be loaded.
//
// If the table is missing, the database is unreachable, or the stored JSON is
// from an older shape, this returns the Interchange default and says so. The
// alternative — an officer at a counter watching a statement crunch die because
// a settings row could not be read — trades a small, visible inaccuracy for a
// total outage, which is the wrong trade every time.
//
// What it must never do is fail SILENTLY. Every result carries where it came
// from, and the report's method page prints it, so "this was produced on the
// defaults because the Registry was unreachable" is a sentence the document can
// actually say.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from "../prisma";
import { DEFAULT_POLICY, normalisePolicy, type CrunchPolicy } from "./policy";

export type PolicySource =
  /** Read from the member's own stored row. */
  | "member"
  /** The member has no row yet; these are the Interchange defaults. */
  | "default"
  /** The store could not be read. Defaults, and the report says so. */
  | "fallback";

export type ResolvedPolicy = {
  policy: CrunchPolicy;
  source: PolicySource;
  /** Present only when `source` is "fallback". Printed, not swallowed. */
  problem?: string;
};

export async function getPolicy(memberCode: string): Promise<ResolvedPolicy> {
  try {
    const row = await prisma.memberPolicy.findUnique({ where: { memberCode } });
    if (!row) {
      return { policy: { ...DEFAULT_POLICY, memberCode }, source: "default" };
    }
    // Normalise on the way OUT as well as in. A row written by an older build
    // can be missing a driver this build scores on, and a missing driver must
    // fall back to its default weight rather than silently score zero.
    const { policy } = normalisePolicy({ ...(row.settings as object), label: row.label, updatedBy: row.updatedBy }, memberCode);
    return { policy: { ...policy, updatedAt: row.updatedAt.toISOString().slice(0, 10) }, source: "member" };
  } catch (e) {
    return {
      policy: { ...DEFAULT_POLICY, memberCode },
      source: "fallback",
      problem: `The crunch policy for ${memberCode} could not be read (${e instanceof Error ? e.message : String(e)}). The Interchange defaults were used.`,
    };
  }
}

export type SaveResult = {
  policy: CrunchPolicy;
  /** Values that were out of range and what they were clamped to. */
  adjusted: string[];
  saved: boolean;
  problem?: string;
};

export async function savePolicy(memberCode: string, input: unknown, updatedBy: string | null): Promise<SaveResult> {
  const { policy, adjusted } = normalisePolicy(input, memberCode);
  policy.updatedBy = updatedBy;

  try {
    await prisma.memberPolicy.upsert({
      where: { memberCode },
      create: { memberCode, label: policy.label, settings: policy as unknown as object, updatedBy },
      update: { label: policy.label, settings: policy as unknown as object, updatedBy },
    });
    return { policy, adjusted, saved: true };
  } catch (e) {
    // Hand the caller the validated policy anyway: the console can still show
    // what WOULD have been saved, which is far more useful than a blank form
    // and a stack trace.
    return {
      policy,
      adjusted,
      saved: false,
      problem: `The settings were valid but could not be stored (${e instanceof Error ? e.message : String(e)}).`,
    };
  }
}

/** Every member with settings of their own. For the admin console's overview. */
export async function listPolicies(): Promise<{ memberCode: string; label: string; updatedBy: string | null; updatedAt: Date }[]> {
  try {
    return await prisma.memberPolicy.findMany({
      select: { memberCode: true, label: true, updatedBy: true, updatedAt: true },
      orderBy: { memberCode: "asc" },
    });
  } catch {
    return [];
  }
}
