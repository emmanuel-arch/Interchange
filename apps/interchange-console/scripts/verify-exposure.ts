// ─────────────────────────────────────────────────────────────────────────────
// Sprint 3 acceptance: the exposure engine, end to end, as a member node.
//
//   npx tsx scripts/verify-exposure.ts [baseUrl]
//
// This runs the whole node-side flow the way Micromart's node would:
//   OPRF → authorise at the Registry → download filters → screen LOCALLY →
//   fan out to member nodes → aggregate → format as CRB 2.0.
//
// It then measures p95 over a real sample, because "under 400ms" is a claim and
// a single timing is an anecdote.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { readFileSync } from "fs";
import { canonicalIdentifier, tokenPreview } from "../lib/oprf/node";
import { evaluateDirect } from "../lib/oprf/registry";
import { signRequest } from "../lib/signing";
import { MANDATORY_SCOPES } from "../lib/consent/scopes";
import { fetchFilters, screen, queryExposure } from "../lib/exposure/broker";
import { ecosystemExposure, delinquencyStatus } from "../lib/reports/crb2";

const BASE = process.argv[2] ?? "http://127.0.0.1:3340";
const KEYS: Record<string, { secretKey: string }> = JSON.parse(
  readFileSync(".member-keys.json", "utf8"),
);
const CALLER = "KE/LENDER/3005"; // Micromart Fintech

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(50)} ${detail}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(50)} ${detail}`); }
}

function tokenFor(nationalId: string): string {
  const input = new TextEncoder().encode(canonicalIdentifier("national_id", nationalId));
  return evaluateDirect(process.env.INTERCHANGE_OPRF_KEY!, input);
}

async function post(path: string, body: unknown, memberCode = CALLER) {
  const payload = JSON.stringify(body);
  const headers = signRequest({
    method: "POST", path, body: payload, memberCode, secretKeyHex: KEYS[memberCode].secretKey,
  });
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: payload,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function plain(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function main() {
  console.log(`\nInterchange Sprint 3 acceptance → ${BASE}\n`);

  const filters = await fetchFilters(BASE);
  const memberCodes = filters.map((f) => f.member_code);
  check("filters published by every member", filters.length >= 8, `${filters.length} filters`);
  check(
    "a filter reveals only bits, never tokens",
    filters.every((f) => typeof f.bits === "string" && !("tokens" in f)),
    `${filters[0].m} bits, k=${filters[0].k}`,
  );

  // ── Screening ───────────────────────────────────────────────────────────
  console.log("\n  \x1b[2mBloom screening — narrowing the fan-out\x1b[0m");

  const demo = tokenFor("39362808");
  const demoCandidates = screen(demo, memberCodes.filter((c) => c !== CALLER), filters);
  check(
    "a known borrower screens in to several members",
    demoCandidates.length >= 2,
    `${demoCandidates.length} of ${memberCodes.length - 1} members`,
  );

  // A token nobody holds should screen almost everyone OUT.
  const stranger = tokenFor("99999999");
  const strangerCandidates = screen(stranger, memberCodes.filter((c) => c !== CALLER), filters);
  check(
    "an unknown borrower screens most members out",
    strangerCandidates.length <= 1,
    `${strangerCandidates.length} of ${memberCodes.length - 1} would be contacted`,
  );

  // No false negatives: every member that ACTUALLY holds the demo token must be
  // a candidate. This is the property the whole design depends on.
  let falseNegatives = 0;
  for (const code of memberCodes.filter((c) => c !== CALLER)) {
    const r = await post("/api/node/exposure", { subject_token: demo, member_code: code });
    if (r.json.has_exposure === true && !demoCandidates.includes(code)) falseNegatives++;
  }
  check("no false negatives — nobody holding is screened out", falseNegatives === 0, `${falseNegatives} missed`);

  // ── Authorise then query ────────────────────────────────────────────────
  console.log("\n  \x1b[2mExposure — authorise, fan out, aggregate\x1b[0m");

  const consent = await plain("/api/consent", {
    subject_token: demo, member_code: CALLER, scopes: MANDATORY_SCOPES, captured_via: "PWA",
  });
  const ref = String(consent.json.consent_ref ?? "");

  const authz = await post("/api/exchange", {
    service_code: "exposure-v1", subject_token: demo, consent_ref: ref,
  });
  check("Registry authorises the exposure query", authz.status === 200, `${authz.status}`);

  const result = await queryExposure({
    baseUrl: BASE,
    callerCode: CALLER,
    callerSecretKey: KEYS[CALLER].secretKey,
    memberCodes,
    filters,
    subjectToken: demo,
    discloseLenders: false,
  });

  check(
    "exposure found across multiple lenders",
    result.lenders >= 2 && result.activeLoans >= 2,
    `${result.activeLoans} loans across ${result.lenders} lenders, ${result.outstandingBand}`,
  );
  check("every queried node answered", !result.partial, `${result.responded}/${result.queried} responded`);
  check("lender identities withheld without consent", result.lendersNamed === null, "lenders_named: null");

  const disclosed = await queryExposure({
    baseUrl: BASE, callerCode: CALLER, callerSecretKey: KEYS[CALLER].secretKey,
    memberCodes, filters, subjectToken: demo, discloseLenders: true,
  });
  check(
    "lender identities revealed only when disclosed",
    Array.isArray(disclosed.lendersNamed) && disclosed.lendersNamed.length === disclosed.lenders,
    `${disclosed.lendersNamed?.length ?? 0} named`,
  );

  const none = await queryExposure({
    baseUrl: BASE, callerCode: CALLER, callerSecretKey: KEYS[CALLER].secretKey,
    memberCodes, filters, subjectToken: stranger, discloseLenders: false,
  });
  check("a borrower with no exposure returns cleanly", none.lenders === 0, `${none.queried} queried, 0 found`);

  // ── An unsigned node query must fail ────────────────────────────────────
  const unsignedNode = await plain("/api/node/exposure", { subject_token: demo, member_code: NJB_CODE });
  check(
    "an unsigned node query is refused",
    unsignedNode.status === 401,
    `${unsignedNode.status} ${String(unsignedNode.json.error ?? "")}`,
  );

  // ── CRB 2.0 ─────────────────────────────────────────────────────────────
  console.log("\n  \x1b[2mCRB 2.0 — Metropol-shaped envelope\x1b[0m");

  const r20 = ecosystemExposure(result);
  check(
    "report 20 carries the velocity signal",
    r20.report_type === 20 && typeof r20.data.velocity_14d === "number",
    `velocity_14d ${r20.data.velocity_14d}`,
  );
  const r2 = delinquencyStatus(result);
  check(
    "report 2 maps to a Metropol delinquency code",
    r2.report_type === 2 && typeof r2.data.delinquency_code === "string",
    `${r2.data.delinquency_code} — ${r2.data.delinquency_description}`,
  );

  // ── Latency ─────────────────────────────────────────────────────────────
  console.log("\n  \x1b[2mLatency — the 400ms budget\x1b[0m");

  const samples: number[] = [];
  for (let i = 0; i < 30; i++) {
    const token = tokenFor(String(30_000_000 + i * 7));
    const t = Date.now();
    await queryExposure({
      baseUrl: BASE, callerCode: CALLER, callerSecretKey: KEYS[CALLER].secretKey,
      memberCodes, filters, subjectToken: token, discloseLenders: false,
    });
    samples.push(Date.now() - t);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length * 0.5)];
  const p95 = samples[Math.floor(samples.length * 0.95)];
  check("p95 exposure query under 400ms", p95 < 400, `p50 ${p50}ms · p95 ${p95}ms · max ${samples.at(-1)}ms`);

  console.log(`\n  demo subject ${tokenPreview(demo)} — ${result.activeLoans} loans, ${result.lenders} lenders, worst ${result.worstBucket}, velocity ${result.velocity14d}`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

const NJB_CODE = "KE/LENDER/0003";

main().catch((e) => { console.error(e); process.exit(1); });
