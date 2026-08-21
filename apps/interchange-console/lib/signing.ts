// ─────────────────────────────────────────────────────────────────────────────
// Member request signing.
//
// Sprint 1's gate read `caller_code` from the request body, which means any
// member could name themselves any other member. This replaces that with an
// Ed25519 signature over a canonical string the member cannot vary:
//
//   METHOD \n PATH \n SHA-256(body) \n timestamp \n nonce \n caller-code
//
// Three properties that matter:
//
//   · IDENTITY. Only the holder of the private key can produce the signature,
//     and the private key never leaves the member's node.
//   · INTEGRITY. The body digest is inside the signed string, so a proxy cannot
//     alter the request without invalidating it.
//   · NON-REPUDIATION. The signature is stored in the message log, so a member
//     cannot later deny having asked. This is the property members will actually
//     care about, because it protects them as much as it binds them.
//
// WHY NOT mTLS, which is what X-Road uses. mTLS authenticates the CONNECTION,
// which requires controlling TLS termination — something a platform like Vercel
// does not hand over. Signing authenticates the MESSAGE, survives any number of
// proxies, and produces an artefact that can be stored and re-verified years
// later. mTLS gives you neither of those. When members run dedicated nodes, the
// two can be layered.
// ─────────────────────────────────────────────────────────────────────────────
import { ed25519 } from "@noble/curves/ed25519.js";
import { createHash, randomBytes } from "crypto";

/** Requests older than this are refused, so a captured request cannot be replayed later. */
export const MAX_CLOCK_SKEW_MS = 60_000;

export type SignedHeaders = {
  "x-interchange-member": string;
  "x-interchange-timestamp": string;
  "x-interchange-nonce": string;
  "x-interchange-signature": string;
};

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function unhex(s: string): Uint8Array {
  return Uint8Array.from(s.trim().toLowerCase().match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

export function bodyDigest(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * The exact bytes both sides sign and verify. Any disagreement here shows up as
 * a signature failure with no clue why, so it lives in one function used by
 * both.
 */
export function canonicalString(parts: {
  method: string;
  path: string;
  bodyDigest: string;
  timestamp: string;
  nonce: string;
  memberCode: string;
}): string {
  return [
    parts.method.toUpperCase(),
    parts.path,
    parts.bodyDigest,
    parts.timestamp,
    parts.nonce,
    parts.memberCode,
  ].join("\n");
}

export function generateMemberKeyPair(): { secretKey: string; publicKey: string } {
  const sk = ed25519.utils.randomSecretKey();
  return { secretKey: hex(sk), publicKey: hex(ed25519.getPublicKey(sk)) };
}

/** Member-node side: sign a request. */
export function signRequest(opts: {
  method: string;
  path: string;
  body: string;
  memberCode: string;
  secretKeyHex: string;
}): SignedHeaders {
  const timestamp = new Date().toISOString();
  const nonce = randomBytes(16).toString("hex");
  const message = canonicalString({
    method: opts.method,
    path: opts.path,
    bodyDigest: bodyDigest(opts.body),
    timestamp,
    nonce,
    memberCode: opts.memberCode,
  });
  const sig = ed25519.sign(new TextEncoder().encode(message), unhex(opts.secretKeyHex));
  return {
    "x-interchange-member": opts.memberCode,
    "x-interchange-timestamp": timestamp,
    "x-interchange-nonce": nonce,
    "x-interchange-signature": hex(sig),
  };
}

export type VerifyFailure =
  | "MISSING_HEADERS"
  | "NO_REGISTERED_KEY"
  | "CLOCK_SKEW"
  | "BAD_SIGNATURE";

export type VerifyResult =
  | { ok: true; memberCode: string; signature: string; digest: string }
  | { ok: false; failure: VerifyFailure; message: string };

/** Registry side: verify a request against the member's registered public key. */
export function verifyRequest(opts: {
  method: string;
  path: string;
  body: string;
  headers: Headers;
  publicKeyHex: string | null;
}): VerifyResult {
  const memberCode = opts.headers.get("x-interchange-member");
  const timestamp = opts.headers.get("x-interchange-timestamp");
  const nonce = opts.headers.get("x-interchange-nonce");
  const signature = opts.headers.get("x-interchange-signature");

  if (!memberCode || !timestamp || !nonce || !signature) {
    return {
      ok: false,
      failure: "MISSING_HEADERS",
      message:
        "Signed requests need x-interchange-member, -timestamp, -nonce and -signature.",
    };
  }

  if (!opts.publicKeyHex) {
    return {
      ok: false,
      failure: "NO_REGISTERED_KEY",
      message: `Member ${memberCode} has no registered public key.`,
    };
  }

  const skew = Math.abs(Date.now() - Date.parse(timestamp));
  if (!Number.isFinite(skew) || skew > MAX_CLOCK_SKEW_MS) {
    return {
      ok: false,
      failure: "CLOCK_SKEW",
      message: `Timestamp is outside the ${MAX_CLOCK_SKEW_MS / 1000}s window.`,
    };
  }

  const digest = bodyDigest(opts.body);
  const message = canonicalString({
    method: opts.method,
    path: opts.path,
    bodyDigest: digest,
    timestamp,
    nonce,
    memberCode,
  });

  let valid = false;
  try {
    valid = ed25519.verify(
      unhex(signature),
      new TextEncoder().encode(message),
      unhex(opts.publicKeyHex),
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    return { ok: false, failure: "BAD_SIGNATURE", message: "Signature does not verify." };
  }

  return { ok: true, memberCode, signature, digest };
}
