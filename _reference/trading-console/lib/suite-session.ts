/**
 * BirgenAI suite session — Auth.js v5 compatible JWE cookie.
 *
 * The rest of the suite (birgen-ai-frontend hub, movies) authenticates with
 * Auth.js v5 (next-auth 5 beta / @auth/core 0.37.2) using a JWT-strategy session
 * stored in an ENCRYPTED cookie. This module re-implements Auth.js's exact
 * encode/decode (see @auth/core/jwt.js) with `jose` + `@panva/hkdf` — the same
 * primitives Auth.js itself uses — so a session minted here is byte-for-byte
 * readable by the suite, and a session minted by birgenai.com is readable here.
 * That gives us true single sign-on across *.birgenai.com WITHOUT pulling the
 * whole next-auth dependency into Next 16 / React 19.
 *
 * Edge-safe: imports only `jose` + `@panva/hkdf`, so `middleware.ts` can use it.
 *
 * Cookie name / domain / secret MUST mirror the suite's auth.config.ts exactly.
 */
import { hkdf } from "@panva/hkdf";
import {
  EncryptJWT,
  base64url,
  calculateJwkThumbprint,
  jwtDecrypt,
} from "jose";

const ALG = "dir";
const ENC = "A256CBC-HS512";
const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, matches Auth.js default
const nowSeconds = () => (Date.now() / 1000) | 0;

/** True in production (Vercel sets NODE_ENV=production). Drives the `__Secure-`
 *  cookie-name prefix and the `secure` flag — must match the suite's issuer,
 *  whose auth.config.ts keys the name off `NODE_ENV === "production"`. */
export function isSecureEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Suite-specific session cookie name. Identical to the hub + movies. Also the
 *  JWE salt, so it has to match for cross-app decryption. */
export function getCookieName(): string {
  return isSecureEnv()
    ? "__Secure-birgenai-suite.session-token"
    : "birgenai-suite.session-token";
}

/**
 * Normalises AUTH_COOKIE_DOMAIN. Any *.birgenai.com host collapses to the shared
 * parent ".birgenai.com" so the session spans the whole suite. Unset / localhost
 * → undefined (host-only cookie). Must stay identical to the suite's resolver.
 */
export function getCookieDomain(): string | undefined {
  const raw = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (!raw) return undefined;
  const host = raw
    .replace(/^https?:\/\//i, "")
    .replace(/[/:].*$/, "")
    .toLowerCase();
  if (!host || host === "localhost") return undefined;
  if (host.endsWith("birgenai.com")) return ".birgenai.com";
  return host;
}

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Missing NEXTAUTH_SECRET / AUTH_SECRET — required to sign suite sessions",
    );
  }
  return secret;
}

/** HKDF key derivation, identical to @auth/core getDerivedEncryptionKey(). */
async function getDerivedEncryptionKey(
  keyMaterial: string,
  salt: string,
): Promise<Uint8Array> {
  // A256CBC-HS512 → 64-byte key
  return hkdf(
    "sha256",
    keyMaterial,
    salt,
    `Auth.js Generated Encryption Key (${salt})`,
    64,
  );
}

async function thumbprint(key: Uint8Array): Promise<string> {
  return calculateJwkThumbprint(
    { kty: "oct", k: base64url.encode(key) },
    `sha${key.byteLength << 3}` as "sha512",
  );
}

/** Claims we put on the suite session — mirrors what the suite's jwt/session
 *  callbacks expect (token.sub → user id, plus role/tier/etc.). */
export interface SuiteClaims {
  sub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  role?: string | null;
  tier?: string | null;
  organizationId?: string | null;
  birgenAiId?: string | null;
}

/** Encrypt a suite session into an Auth.js-compatible JWE string. */
export async function mintSuiteSession(
  claims: SuiteClaims,
  maxAge: number = DEFAULT_MAX_AGE,
): Promise<string> {
  const salt = getCookieName();
  const key = await getDerivedEncryptionKey(getSecret(), salt);
  const kid = await thumbprint(key);

  // Drop undefined so the payload stays clean.
  const payload = Object.fromEntries(
    Object.entries(claims).filter(([, v]) => v !== undefined),
  );

  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: ALG, enc: ENC, kid })
    .setIssuedAt()
    .setExpirationTime(nowSeconds() + maxAge)
    .setJti(crypto.randomUUID())
    .encrypt(key);
}

export type SuiteSession = SuiteClaims & {
  iat?: number;
  exp?: number;
  jti?: string;
};

/** Decrypt + verify a suite session cookie value. Returns null if absent/invalid. */
export async function readSuiteSession(
  token: string | undefined | null,
): Promise<SuiteSession | null> {
  if (!token) return null;
  const salt = getCookieName();
  try {
    const { payload } = await jwtDecrypt(
      token,
      async () => getDerivedEncryptionKey(getSecret(), salt),
      {
        clockTolerance: 15,
        keyManagementAlgorithms: [ALG],
        contentEncryptionAlgorithms: [ENC, "A256GCM"],
      },
    );
    if (!payload?.sub) return null;
    return payload as SuiteSession;
  } catch {
    return null;
  }
}

/** Cookie options for Set-Cookie, matching the suite's cookies.sessionToken. */
export function sessionCookieOptions(maxAge: number = DEFAULT_MAX_AGE) {
  const domain = getCookieDomain();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isSecureEnv(),
    maxAge,
    ...(domain ? { domain } : {}),
  };
}
