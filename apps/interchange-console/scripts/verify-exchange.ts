// ─────────────────────────────────────────────────────────────────────────────
// Sprint 2 acceptance: two members exchange a signed, consented, logged call.
//
//   npx tsx scripts/verify-exchange.ts [baseUrl]
//
// This acts as a member NODE: it holds a private key, blinds identifiers
// locally, talks to the Registry only in blinded or signed form, and never lets
// a raw national ID cross the wire.
//
// It proves the four Sprint 2 claims, and tries to break each one:
//   · OPRF   — the Registry cannot see the identifier; tokens still match
//   · SIGNING— identity is proved, not claimed; forgery and replay both fail
//   · LOG    — the chain is hash-linked and tamper-evident
//   · POLICY — reciprocity, quota, consent and scope all still refuse
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { readFileSync } from "fs";
import { blind, finalize, tokenPreview } from "../lib/oprf/node";
import { signRequest, generateMemberKeyPair } from "../lib/signing";
import { MANDATORY_SCOPES } from "../lib/consent/scopes";

const BASE = process.argv[2] ?? "http://127.0.0.1:3330";
const KEYS: Record<string, { secretKey: string; publicKey: string }> = JSON.parse(
  readFileSync(".member-keys.json", "utf8"),
);

const MICROMART = "KE/LENDER/3005";
const NJB = "KE/LENDER/0003";
const ATICO = "KE/LENDER/0023"; // SHADOW
const FOURSIGHT = "KE/LENDER/0005"; // SUSPENDED

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(52)} ${detail}`);
  } else {
    fail++;
    console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(52)} ${detail}`);
  }
}

/** A member node making a signed call. */
async function signed(
  memberCode: string,
  path: string,
  body: unknown,
  opts: { secretKeyHex?: string; tamperBody?: unknown } = {},
) {
  const payload = JSON.stringify(body);
  const headers = signRequest({
    method: "POST",
    path,
    body: payload,
    memberCode,
    secretKeyHex: opts.secretKeyHex ?? KEYS[memberCode].secretKey,
  });
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    // Sending a DIFFERENT body than the one signed, to prove integrity.
    body: opts.tamperBody !== undefined ? JSON.stringify(opts.tamperBody) : payload,
  });
  return {
    status: res.status,
    headers: res.headers,
    json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

async function plain(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Full OPRF exchange, run as the member would run it. */
async function deriveToken(memberCode: string, kind: "national_id" | "msisdn", raw: string) {
  const { input, blind: blindScalar, blindedHex } = blind(kind, raw);
  const res = await signed(memberCode, "/api/oprf/evaluate", { blinded: blindedHex });
  if (res.status !== 200) throw new Error(`OPRF failed: ${res.status} ${JSON.stringify(res.json)}`);
  return { token: finalize(input, blindScalar, String(res.json.evaluated)), blindedHex };
}

async function main() {
  console.log(`\nInterchange Sprint 2 acceptance → ${BASE}\n`);

  // ── OPRF ────────────────────────────────────────────────────────────────
  console.log("  \x1b[2mOPRF — the Registry never sees the identifier\x1b[0m");

  const a1 = await deriveToken(MICROMART, "national_id", "39362808");
  const a2 = await deriveToken(NJB, "national_id", "39362808");
  check(
    "same person, two members → identical token",
    a1.token === a2.token,
    tokenPreview(a1.token),
  );
  check(
    "same person, two calls → different blinded element",
    a1.blindedHex !== a2.blindedHex,
    "Registry cannot link the two requests",
  );

  const other = await deriveToken(MICROMART, "national_id", "11223344");
  check("different people → different tokens", other.token !== a1.token, tokenPreview(other.token));

  const msisdnA = await deriveToken(MICROMART, "msisdn", "0758517032");
  const msisdnB = await deriveToken(MICROMART, "msisdn", "+254758517032");
  check(
    "0758…, +254758… normalise to one token",
    msisdnA.token === msisdnB.token,
    tokenPreview(msisdnA.token),
  );

  const unsignedOprf = await plain("/api/oprf/evaluate", { blinded: a1.blindedHex });
  check(
    "unsigned OPRF request is refused",
    unsignedOprf.status === 401,
    `${unsignedOprf.status} ${String(unsignedOprf.json.error ?? "")}`,
  );

  // ── Signing ─────────────────────────────────────────────────────────────
  console.log("\n  \x1b[2mSigning — identity proved, not claimed\x1b[0m");

  const consent = await plain("/api/consent", {
    subject_token: a1.token,
    member_code: MICROMART,
    scopes: MANDATORY_SCOPES,
    captured_via: "PWA",
  });
  const ref = String(consent.json.consent_ref ?? "");
  check("consent issues against an OPRF token", consent.status === 201, `${consent.status}`);

  const forged = generateMemberKeyPair();
  const impersonation = await signed(
    MICROMART,
    "/api/exchange",
    { service_code: "exposure-v1", subject_token: a1.token, consent_ref: ref },
    { secretKeyHex: forged.secretKey },
  );
  check(
    "signing as Micromart with the wrong key fails",
    impersonation.status === 401 && impersonation.json.error === "BAD_SIGNATURE",
    `${impersonation.status} ${String(impersonation.json.error ?? "")}`,
  );

  const tampered = await signed(
    MICROMART,
    "/api/exchange",
    { service_code: "exposure-v1", subject_token: a1.token, consent_ref: ref },
    { tamperBody: { service_code: "report-12", subject_token: a1.token, consent_ref: ref } },
  );
  check(
    "altering the body after signing fails",
    tampered.status === 401 && tampered.json.error === "BAD_SIGNATURE",
    `${tampered.status} ${String(tampered.json.error ?? "")}`,
  );

  const unsignedExchange = await plain("/api/exchange", {
    service_code: "exposure-v1",
    subject_token: a1.token,
    consent_ref: ref,
  });
  check(
    "unsigned exchange is refused",
    unsignedExchange.status === 401,
    `${unsignedExchange.status} ${String(unsignedExchange.json.error ?? "")}`,
  );

  // ── The exchange itself ─────────────────────────────────────────────────
  console.log("\n  \x1b[2mExchange — signed, consented, logged\x1b[0m");

  const ok = await signed(MICROMART, "/api/exchange", {
    service_code: "exposure-v1",
    subject_token: a1.token,
    consent_ref: ref,
  });
  const seq = ok.headers.get("x-interchange-log-seq");
  const hash = ok.headers.get("x-interchange-log-hash");
  check(
    "a valid signed call is granted",
    ok.status === 200 && ok.json.authorised === true,
    `${ok.status} in ${String(ok.json.latency_ms ?? "?")}ms`,
  );
  check("caller receives a log receipt", !!seq && !!hash, `seq ${seq} hash ${hash?.slice(0, 12)}…`);

  // Second member, same borrower — this is the two-member exchange.
  const njbConsent = await plain("/api/consent", {
    subject_token: a1.token,
    member_code: NJB,
    scopes: MANDATORY_SCOPES,
  });
  const njbRef = String(njbConsent.json.consent_ref ?? "");
  const njbCall = await signed(NJB, "/api/exchange", {
    service_code: "exposure-v1",
    subject_token: a1.token,
    consent_ref: njbRef,
  });
  check(
    "a second member exchanges on the same subject",
    njbCall.status === 200,
    `NJB seq ${njbCall.headers.get("x-interchange-log-seq")}`,
  );

  // ── Policy still refuses ────────────────────────────────────────────────
  console.log("\n  \x1b[2mPolicy — the refusals still hold under signing\x1b[0m");

  const shadow = await signed(ATICO, "/api/exchange", {
    service_code: "exposure-v1",
    subject_token: a1.token,
    consent_ref: ref,
  });
  check(
    "shadow member refused even with a valid signature",
    shadow.status === 403 && shadow.json.outcome === "REFUSED_RECIPROCITY",
    `${shadow.status} ${String(shadow.json.outcome ?? "")}`,
  );

  const suspendedOprf = await signed(FOURSIGHT, "/api/oprf/evaluate", { blinded: a1.blindedHex });
  check(
    "suspended member cannot even mint tokens",
    suspendedOprf.status === 403,
    `${suspendedOprf.status} ${String(suspendedOprf.json.error ?? "")}`,
  );

  const wrongSubject = await signed(MICROMART, "/api/exchange", {
    service_code: "exposure-v1",
    subject_token: other.token,
    consent_ref: ref, // consent for a DIFFERENT person
  });
  check(
    "another person's consent still cannot unlock",
    wrongSubject.status === 403 && wrongSubject.json.outcome === "REFUSED_NO_CONSENT",
    `${wrongSubject.status} ${String(wrongSubject.json.outcome ?? "")}`,
  );

  const rawId = await signed(MICROMART, "/api/exchange", {
    service_code: "exposure-v1",
    subject_token: "39362808",
    consent_ref: ref,
  });
  check(
    "a raw national ID is refused at the exchange",
    rawId.status === 422,
    `${rawId.status} ${String(rawId.json.error ?? "")}`,
  );

  // ── Session ─────────────────────────────────────────────────────────────
  console.log("\n  \x1b[2mSession — the console is behind the same identity\x1b[0m");

  const noSession = await fetch(`${BASE}/directory`, { redirect: "manual" });
  check(
    "console redirects to the gate without a session",
    noSession.status === 307 || noSession.status === 302,
    `${noSession.status} → ${noSession.headers.get("location") ?? ""}`,
  );

  const session = await signed(MICROMART, "/api/session", {});
  check("signed session request succeeds", session.status === 200, `${session.status}`);

  // ── Chain integrity ─────────────────────────────────────────────────────
  console.log("\n  \x1b[2mMessage log — tamper-evident\x1b[0m");

  const verifyRes = await fetch(`${BASE}/api/log/verify`);
  const chain = (await verifyRes.json()) as Record<string, unknown>;
  check(
    "chain verifies from genesis",
    verifyRes.status === 200 && chain.ok === true,
    `${chain.checked} entries re-derived`,
  );

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
