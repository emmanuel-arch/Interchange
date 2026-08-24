// ─────────────────────────────────────────────────────────────────────────────
// Console sessions.
//
// WHAT WAS WRONG. Sprint 1's cookie held a bare member code and proxy.ts checked
// only that SOMETHING was there. Any visitor could type
// `document.cookie = "interchange_session=KE/LENDER/3005"` and be inside the
// console as the largest lender in the cohort. The cookie was httpOnly, which
// stops a script READING it and does nothing at all to stop a person WRITING it.
//
// WHAT THIS IS. A compact signed token — payload plus HMAC-SHA256 — so the
// server can tell a cookie it minted from a cookie someone typed. It is a JWT in
// all but registration: same three properties (compact, self-describing,
// verifiable without a lookup), no dependency added, and the payload is
// deliberately small because it rides on every request.
//
// WHY NOT A SESSION TABLE. A stateless token means proxy.ts can authorise
// without touching Postgres on every navigation. The cost is that revocation
// waits for expiry, which is why TTL is eight hours rather than a fortnight, and
// why DISABLED is re-checked on every route that actually spends a right.
//
// The signing key is INTERCHANGE_SESSION_SECRET. It is NOT the OPRF key: that
// one re-tokenises every borrower in the ecosystem if it rotates, and a console
// secret must be rotatable on a Tuesday afternoon without consequence.
// ─────────────────────────────────────────────────────────────────────────────
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "interchange_session";

/** Eight hours — one working day, and short enough that revocation-by-expiry is real. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type ConsoleSession = {
  /** Operator id, or the member code for a node-signed member session. */
  sub: string;
  /** How this session was established. */
  kind: "operator" | "member";
  name: string;
  role: string;
  /** Member code this session acts for. Null for a platform operator. */
  member: string | null;
  /** Effective rights, wildcard unexpanded. */
  rights: string[];
  /** Unix seconds. */
  exp: number;
};

function secret(): Buffer {
  const s = process.env.INTERCHANGE_SESSION_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error(
      "INTERCHANGE_SESSION_SECRET is not set (or is shorter than 32 chars). " +
        "Generate one with: npm run keys:session",
    );
  }
  return Buffer.from(s, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

/** Mint a token. `exp` is filled in here so no caller can accidentally omit it. */
export function mintSession(session: Omit<ConsoleSession, "exp">, ttlSeconds = SESSION_TTL_SECONDS): string {
  const full: ConsoleSession = { ...session, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payload = b64url(Buffer.from(JSON.stringify(full), "utf8"));
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify and decode. Null for anything that is not a live, untampered token —
 * missing, malformed, wrong signature, or expired. Callers treat null as
 * "signed out"; there is deliberately no way to learn WHICH of those it was,
 * because that distinction is only ever useful to someone probing.
 */
export function readSession(token: string | undefined | null): ConsoleSession | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);

  // Constant-time, and length-guarded because timingSafeEqual throws on a
  // length mismatch rather than returning false.
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null; // secret missing — fail closed, never fail open
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConsoleSession;
    if (!parsed?.sub || typeof parsed.exp !== "number") return null;
    if (parsed.exp * 1000 <= Date.now()) return null;
    if (!Array.isArray(parsed.rights)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Cookie attributes, in one place so the setter and the clearer cannot drift. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}
