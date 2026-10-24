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
  /** The work email on record, once bound. */
  email: string | null;
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
  | { ok: false; reason: AuthFailure; message: string; retryAfterMinutes?: number; chargeOperatorId?: string };

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

/** Work emails are compared lower-cased and trimmed, and stored that way. */
export function normaliseEmail(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

/**
 * Verify a work email and access code, and return the operator behind them.
 *
 * ── THE EMAIL CHOOSES THE OPERATOR; THE CODE PROVES IT ───────────────────────
 * Since 24 Oct 2026 the door asks for the work email the person signs in to the
 * rest of the estate with, beside the code. The email selects ONE operator and
 * the code is checked against that operator alone — so a wrong code is charged
 * to the account it was aimed at, and five misses lock that account, rather than
 * every guess being tried against everybody.
 *
 * ── AN OPERATOR WITH NO EMAIL YET ────────────────────────────────────────────
 * Operators created before emails existed have none on record. For them the old
 * rule still holds — the code alone identifies them, by a SCAN rather than an
 * index (a deterministic index over 10,000 values is a lookup table) — and the
 * email they typed is bound to them on that first sign-in, if no one else holds
 * it. From then on the pair is required. That is no weaker than the code-only
 * door it replaces, and it means nobody is locked out on the day the email
 * becomes part of the credential. The binding is audited (EMAIL_BOUND).
 */
export async function authenticateCode(rawCode: string, ip: string | null, rawEmail?: string | null): Promise<AuthResult> {
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
  const email = normaliseEmail(rawEmail);
  const holder = email ? operators.find((op) => op.email === email) ?? null : null;

  let matched: (typeof operators)[number] | null = null;
  let bindEmail = false;
  if (holder) {
    // The email names an operator: the code is checked against that one only.
    if (verifyCode(code, holder.codeHash, holder.codeSalt)) matched = holder;
  } else {
    // No operator holds this email (or none was typed): only an operator who has
    // no email yet may be identified by the code alone — see above.
    for (const op of operators) {
      if (op.email) continue;
      if (verifyCode(code, op.codeHash, op.codeSalt)) {
        matched = op;
        bindEmail = !!email;
        break;
      }
    }
  }

  if (!matched) {
    await record("SIGN_IN_REFUSED", holder?.id ?? null, holder ? "code did not match this email" : "no operator matched", ip);
    return {
      ok: false,
      reason: "INVALID",
      message: "That email and access code don't match.",
      ...(holder ? { chargeOperatorId: holder.id } : {}),
    };
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

  // First sign-in with an email: bind it, unless somebody else already holds it
  // (the unique index would refuse, and the sign-in itself must not fail on it).
  let boundEmail = matched.email;
  if (bindEmail && email) {
    const bound = await prisma.operator
      .update({ where: { id: matched.id }, data: { email } })
      .then(() => true)
      .catch(() => false);
    if (bound) {
      boundEmail = email;
      await record("EMAIL_BOUND", matched.id, email, ip);
    }
  }

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
      email: boundEmail,
      memberCode: member?.code ?? null,
      memberName: member?.name ?? null,
      rights: effectiveRights(matched.role, matched.rights),
    },
  };
}

/**
 * Charge a failed attempt.
 *
 * When the email named an operator, the miss is charged to that operator alone —
 * the guess was aimed at them, and their own lockout is what stops it.
 *
 * Otherwise the miss matched nobody, so there is no single account to charge,
 * and it is charged to every operator the code alone could still have opened
 * (those with no email yet). Counter-intuitive, and correct: incrementing across
 * the board is what stops an attacker enumerating the space with impunity — and
 * because a SUCCESSFUL sign-in clears the counter, a legitimate operator who
 * signs in daily is never affected by someone else fumbling their code earlier.
 */
export async function chargeFailedAttempt(ip: string | null, operatorId?: string | null): Promise<void> {
  const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
  const operators = await prisma.operator.findMany({
    where: operatorId ? { id: operatorId, status: "ACTIVE" } : { status: "ACTIVE", email: null },
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
    email: op.email,
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
