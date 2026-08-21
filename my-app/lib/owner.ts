/**
 * Owner auth for the single-user trading gate.
 *
 * The 4-digit access code unlocks the platform as one specific account in the
 * shared `users` table (configured via OWNER_EMAIL). On success we mint a real
 * BirgenAI suite session bound to that user's id, so SSO identity is consistent
 * across the suite. SERVER ONLY — never import from client code.
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { SuiteClaims } from "@/lib/suite-session";

export interface OwnerUser {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  tier: string | null;
  organizationId: string | null;
  birgenAiId: string | null;
}

/** Look up the owner account in the shared `users` table by OWNER_EMAIL. */
export async function getOwnerUser(): Promise<OwnerUser | null> {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!email) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, email, name, role, tier, organizationId, birgenai_id")
    .ilike("email", email)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    email: String(row.email),
    name: (row.name as string) ?? null,
    role: (row.role as string) ?? null,
    tier: (row.tier as string) ?? null,
    organizationId: (row.organizationId as string) ?? null,
    birgenAiId: (row.birgenai_id as string) ?? null,
  };
}

/** Map an owner row to the claims put on the suite session cookie. */
export function ownerToClaims(user: OwnerUser): SuiteClaims {
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    picture: null,
    role: user.role,
    tier: user.tier,
    organizationId: user.organizationId,
    birgenAiId: user.birgenAiId,
  };
}

/** Constant-time compare of a submitted code against TRADING_ACCESS_CODE. */
export function verifyAccessCode(submitted: string): boolean {
  const expected = process.env.TRADING_ACCESS_CODE?.trim();
  if (!expected) return false;
  const a = Buffer.from(String(submitted));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  // timingSafeEqual needs equal-length buffers (guaranteed above).
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ── Best-effort in-memory rate limiter ──────────────────────────────────────
// A 4-digit code is only 10k combinations, so throttle attempts per client. This
// is per-instance (not durable across serverless cold starts / regions); harden
// with a shared store (e.g. Upstash) before opening the platform to more users.
const WINDOW_MS = 5 * 60_000; // 5 minutes
const MAX_ATTEMPTS = 8; // failed attempts per window before lockout
const attempts = new Map<string, { count: number; resetAt: number }>();

export interface RateResult {
  ok: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string): RateResult {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}
