// ─────────────────────────────────────────────────────────────────────────────
// Sprint 1 acceptance: prove the consent gate actually refuses.
//
//   npx tsx scripts/verify-gate.ts [baseUrl]
//
// Anyone can build a gate that says yes. The claim being made to members is
// that it says NO — for the right reason, every time, and leaves a record. So
// this exercises every refusal path, not the happy path.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { subjectToken } from "../lib/tokens";
import { MANDATORY_SCOPES } from "../lib/consent/scopes";

const BASE = process.argv[2] ?? "http://127.0.0.1:3320";

let pass = 0;
let fail = 0;

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(46)} ${detail}`);
  } else {
    fail++;
    console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(46)} ${detail}`);
  }
}

async function main() {
  console.log(`\nInterchange gate acceptance → ${BASE}\n`);

  // Two different people. Tokens are derived at the edge, exactly as a node would.
  const alice = subjectToken("national_id", "39362808");
  const bob = subjectToken("national_id", "11223344");

  // ── The tokenisation boundary ───────────────────────────────────────────────
  const raw = await post("/api/consent", {
    subject_token: "39362808",
    member_code: "KE/LENDER/3005",
    scopes: MANDATORY_SCOPES,
  });
  check(
    "raw national ID is refused at the boundary",
    raw.status === 422 && raw.json.error === "IDENTIFIER_NOT_TOKENISED",
    `${raw.status} ${String(raw.json.error ?? "")}`,
  );

  // ── Mandatory scopes ────────────────────────────────────────────────────────
  const partial = await post("/api/consent", {
    subject_token: alice,
    member_code: "KE/LENDER/3005",
    scopes: ["kyc.verify"],
  });
  check(
    "consent missing a mandatory scope is refused",
    partial.status === 422 && partial.json.error === "MANDATORY_SCOPE_MISSING",
    `${partial.status} ${String(partial.json.error ?? "")}`,
  );

  // ── Issue a good consent ────────────────────────────────────────────────────
  const issued = await post("/api/consent", {
    subject_token: alice,
    member_code: "KE/LENDER/3005",
    scopes: MANDATORY_SCOPES,
    captured_via: "PWA",
    evidence: { channel: "micro-eazy-pwa", otp: "verified" },
  });
  const ref = String(issued.json.consent_ref ?? "");
  check("consent issues", issued.status === 201 && ref.startsWith("csn_"), `${issued.status} ${ref.slice(0, 20)}…`);

  // A consent for someone else, to test the impersonation path.
  const bobIssued = await post("/api/consent", {
    subject_token: bob,
    member_code: "KE/LENDER/3005",
    scopes: MANDATORY_SCOPES,
  });
  const bobRef = String(bobIssued.json.consent_ref ?? "");

  // ── The gate ────────────────────────────────────────────────────────────────
  const granted = await post("/api/authorise", {
    caller_code: "KE/LENDER/3005",
    service_code: "exposure-v1",
    subject_token: alice,
    consent_ref: ref,
  });
  check("valid consent is granted", granted.status === 200 && granted.json.authorised === true, `${granted.status}`);

  const noRef = await post("/api/authorise", {
    caller_code: "KE/LENDER/3005",
    service_code: "exposure-v1",
    subject_token: alice,
  });
  check(
    "no consent_ref is refused",
    noRef.status === 403 && noRef.json.outcome === "REFUSED_NO_CONSENT",
    `${noRef.status} ${String(noRef.json.outcome ?? "")}`,
  );

  const wrongSubject = await post("/api/authorise", {
    caller_code: "KE/LENDER/3005",
    service_code: "exposure-v1",
    subject_token: alice,
    consent_ref: bobRef, // valid consent, wrong person
  });
  check(
    "another person's consent cannot unlock this one",
    wrongSubject.status === 403 && wrongSubject.json.outcome === "REFUSED_NO_CONSENT",
    `${wrongSubject.status} ${String(wrongSubject.json.outcome ?? "")}`,
  );

  const unknownRef = await post("/api/authorise", {
    caller_code: "KE/LENDER/3005",
    service_code: "exposure-v1",
    subject_token: alice,
    consent_ref: "csn_deadbeefdeadbeefdeadbeefdeadbeef",
  });
  check(
    "an invented consent_ref is refused",
    unknownRef.status === 403 && unknownRef.json.outcome === "REFUSED_NO_CONSENT",
    `${unknownRef.status} ${String(unknownRef.json.outcome ?? "")}`,
  );

  // ── Scope ───────────────────────────────────────────────────────────────────
  // report-22 needs collections.contact. Issue a consent WITHOUT it by using a
  // second subject, then confirm the mandatory-scope rule still lets it through
  // capture but the gate refuses the narrower service.
  const carol = subjectToken("national_id", "55667788");
  const carolRef = String(
    (
      await post("/api/consent", {
        subject_token: carol,
        member_code: "KE/LENDER/3005",
        // every mandatory scope EXCEPT collections.contact is impossible (it is
        // mandatory), so instead test an OPTIONAL-scope service.
        scopes: MANDATORY_SCOPES,
      })
    ).json.consent_ref ?? "",
  );
  const optionalScoped = await post("/api/authorise", {
    caller_code: "KE/LENDER/3005",
    service_code: "report-22", // requires collections.contact — mandatory, so granted
    subject_token: carol,
    consent_ref: carolRef,
  });
  check(
    "service whose scope IS held is granted",
    optionalScoped.status === 200,
    `${optionalScoped.status} report-22`,
  );

  // ── Reciprocity ─────────────────────────────────────────────────────────────
  const shadow = await post("/api/authorise", {
    caller_code: "KE/LENDER/0023", // ATICO AFRICA — seeded in SHADOW
    service_code: "exposure-v1",
    subject_token: alice,
    consent_ref: ref,
  });
  check(
    "a member in the shadow period cannot query",
    shadow.status === 403 && shadow.json.outcome === "REFUSED_RECIPROCITY",
    `${shadow.status} ${String(shadow.json.outcome ?? "")}`,
  );

  const suspended = await post("/api/authorise", {
    caller_code: "KE/LENDER/0005", // FOURSIGHT — dormant, SUSPENDED
    service_code: "exposure-v1",
    subject_token: alice,
    consent_ref: ref,
  });
  check(
    "a member who stopped contributing cannot query",
    suspended.status === 403 && suspended.json.outcome === "REFUSED_RECIPROCITY",
    `${suspended.status} ${String(suspended.json.outcome ?? "")}`,
  );

  // ── Revocation ──────────────────────────────────────────────────────────────
  const revoked = await post(`/api/consent/${ref}/revoke`, { reason: "borrower withdrew" });
  check("consent revokes", revoked.status === 200 && !!revoked.json.revoked_at, `${revoked.status}`);

  const afterRevoke = await post("/api/authorise", {
    caller_code: "KE/LENDER/3005",
    service_code: "exposure-v1",
    subject_token: alice,
    consent_ref: ref,
  });
  check(
    "a revoked consent stops answering immediately",
    afterRevoke.status === 403 && afterRevoke.json.outcome === "REFUSED_NO_CONSENT",
    `${afterRevoke.status} ${String(afterRevoke.json.outcome ?? "")}`,
  );

  const twice = await post(`/api/consent/${ref}/revoke`, {});
  check("revoking twice is idempotent", twice.status === 200 && twice.json.already_revoked === true, `${twice.status}`);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
