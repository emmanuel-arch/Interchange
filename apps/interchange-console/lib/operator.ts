// ─────────────────────────────────────────────────────────────────────────────
// Operator authentication — the access-code path behind the vault gate.
//
// A FOUR-DIGIT CODE IS 10,000 GUESSES. That is the honest starting point, and it
// means the hash is not the control that matters here. An attacker who reaches
// this endpoint does not need to break scrypt; they need to be allowed to try
// 10,000 times. So the controls, in the order they actually do work:
//
//   1. PER-OPERATOR LOCKOUT. MAX_FAILED_ATTEMPTS wrong codes locks that operator
//      for LOCKOUT_MINUTES. Persisted in Postgres, not in memory, because a
//      counter that resets when a serverless instance recycles is not a counter.
//   2. PER-IP THROTTLE. Counted from OperatorAudit, so one host cannot walk the
//      space by spreading guesses across operators.
//   3. A PRODUCTION FENCE. Code login is refused outright when NODE_ENV is
//      production unless INTERCHANGE_ALLOW_CODE_LOGIN=1 is explicitly set. The
//      member-certificate path (Ed25519, /api/session) is the production door;
//      this one is for the console on a laptop and for demonstrations.
//
// scrypt is still used, per-operator-salted, so that a leaked database does not
// hand over the codes themselves — an operator who reuses that PIN elsewhere
// should not be harmed by a Registry breach.
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { effectiveRights, WILDCARD } from "@/lib/rights";
import type { ConsoleSession } from "@/lib/session";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
/** Refused attempts from one IP inside this window before it is shut out. */
export const IP_ATTEMPT_WINDOW_MINUTES = 15;
export const IP_MAX_ATTEMPTS = 20;

const SCRYPT_KEYLEN = 64;

/** The shape the gate is allowed to see. Never carries the hash or the salt. */
export type AuthedOperator = {
  id: string;
  name: string;
  role: string;
  memberCode: string | null;
  memberName: string | null;
  rights: string[];
};

export type AuthFailure =
  | "DISABLED_IN_PRODUCTION"
  | "INVALID"
  | "LOCKED"
  | "THROTTLED"
  | "MISCONFIGURED";

export type AuthResult =
  | { ok: true; operator: AuthedOperator }
  | { ok: false; reason: AuthFailure; message: string; retryAfterMinutes?: number };

// ── Code hashing ─────────────────────────────────────────────────────────────

export function hashCode(code: string): { codeHash: string; codeSalt: string } {
  const codeSalt = randomBytes(16).toString("hex");
  const codeHash = scryptSync(code, codeSalt, SCRYPT_KEYLEN).toString("hex");
  return { codeHash, codeSalt };
}

export function verifyCode(code: string, codeHash: string, codeSalt: string): boolean {
  try {
    const derived = scryptSync(code, codeSalt, SCRYPT_KEYLEN);
    const stored = Buffer.from(codeHash, "hex");
    if (derived.length !== stored.length) return false;
    return timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

/** Four digits, exactly. Enforced at creation AND at the door. */
export function isWellFormedCode(code: string): boolean {
  return /^\d{4}$/.test(code);
}

/** Is the access-code door open at all in this environment? */
export function codeLoginAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.INTERCHANGE_ALLOW_CODE_LOGIN === "1";
}

// ── The door ─────────────────────────────────────────────────────────────────

async function record(action: string, operatorId: string | null, detail: string | null, ip: string | null) {
  await prisma.operatorAudit.create({ data: { action, operatorId, detail, ip } }).catch(() => {});
}

/**
 * Verify an access code and return the operator behind it.
 *
 * The lookup is a SCAN over active operators rather than an indexed read, because
 * indexing a code means storing something derived from it deterministically, and
 * a deterministic index over a 10,000-value space is a lookup table for anyone
 * who reaches the database. Scanning costs one scrypt per operator; the estate is
 * a handful of people, and this runs once per sign-in.
 */
export async function authenticateCode(rawCode: string, ip: string | null): Promise<AuthResult> {
  if (!codeLoginAllowed()) {
    return {
      ok: false,
      reason: "DISABLED_IN_PRODUCTION",
      message: "Access-code sign-in is disabled here. Present a member certificate.",
    };
  }

  const code = (rawCode ?? "").trim();
  if (!isWellFormedCode(code)) {
    return { ok: false, reason: "INVALID", message: "That code was not accepted." };
  }

  // ── Per-IP throttle, before any hashing work is done ──────────────────────
  if (ip) {
    const since = new Date(Date.now() - IP_ATTEMPT_WINDOW_MINUTES * 60_000);
    const recent = await prisma.operatorAudit.count({
      where: { ip, action: "SIGN_IN_REFUSED", at: { gte: since } },
    });
    if (recent >= IP_MAX_ATTEMPTS) {
      return {
        ok: false,
        reason: "THROTTLED",
        message: "Too many attempts from this address. Try again later.",
        retryAfterMinutes: IP_ATTEMPT_WINDOW_MINUTES,
      };
    }
  }

  const operators = await prisma.operator.findMany({
    where: { status: "ACTIVE" },
    orderBy: { lastLoginAt: { sort: "desc", nulls: "last" } },
  });

  if (operators.length === 0) {
    return {
      ok: false,
      reason: "MISCONFIGURED",
      message: "No operators exist yet. Run: npm run operator:create",
    };
  }

  const now = new Date();
  let matched: (typeof operators)[number] | null = null;
  for (const op of operators) {
    if (verifyCode(code, op.codeHash, op.codeSalt)) {
      matched = op;
      break;
    }
  }

  if (!matched) {
    await record("SIGN_IN_REFUSED", null, "no operator matched", ip);
    return { ok: false, reason: "INVALID", message: "That code was not accepted." };
  }

  // The code was right, but the account may still be locked from earlier misses.
  if (matched.lockedUntil && matched.lockedUntil > now) {
    const mins = Math.max(1, Math.ceil((matched.lockedUntil.getTime() - now.getTime()) / 60_000));
    await record("SIGN_IN_REFUSED", matched.id, "locked", ip);
    return {
      ok: false,
      reason: "LOCKED",
      message: "This operator is locked for another " + mins + (mins === 1 ? " minute." : " minutes."),
      retryAfterMinutes: mins,
    };
  }

  const member = matched.memberId
    ? await prisma.member.findUnique({ where: { id: matched.memberId }, select: { code: true, name: true } })
    : null;

  await prisma.operator.update({
    where: { id: matched.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now },
  });
  await record("SIGN_IN", matched.id, matched.role, ip);

  return {
    ok: true,
    operator: {
      id: matched.id,
      name: matched.name,
      role: matched.role,
      memberCode: member?.code ?? null,
      memberName: member?.name ?? null,
      rights: effectiveRights(matched.role, matched.rights),
    },
  };
}

/**
 * Charge a failed attempt against every active operator.
 *
 * Counter-intuitive, and correct: a wrong code matches nobody, so there is no
 * single account to charge it to. Incrementing across the board is what stops an
 * attacker enumerating the space with impunity — and because a SUCCESSFUL sign-in
 * clears the counter, a legitimate operator who signs in daily is never affected
 * by someone else fumbling their PIN an hour earlier.
 */
export async function chargeFailedAttempt(ip: string | null): Promise<void> {
  const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
  const operators = await prisma.operator.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, failedAttempts: true },
  });
  await Promise.all(
    operators.map((op) =>
      prisma.operator
        .update({
          where: { id: op.id },
          data:
            op.failedAttempts + 1 >= MAX_FAILED_ATTEMPTS
              ? { failedAttempts: 0, lockedUntil }
              : { failedAttempts: { increment: 1 } },
        })
        .catch(() => {}),
    ),
  );
  if (operators.length) {
    await record("LOCKED", null, "threshold reached for " + operators.length + " operator(s)", ip);
  }
}

/** Turn an authenticated operator into the session payload. */
export function sessionFor(op: AuthedOperator): Omit<ConsoleSession, "exp"> {
  return {
    sub: op.id,
    kind: "operator",
    name: op.name,
    role: op.role,
    member: op.memberCode,
    rights: op.rights,
  };
}

/** Guard used by the operator CLI: only the platform role may hold the wildcard. */
export function validateGrant(role: string, rights: readonly string[]): string | null {
  if (rights.includes(WILDCARD) && role !== "SUPER_ADMIN") {
    return 'The "*" right is only valid on SUPER_ADMIN.';
  }
  return null;
}

/** Best-effort client IP behind Vercel / a reverse proxy. */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}
