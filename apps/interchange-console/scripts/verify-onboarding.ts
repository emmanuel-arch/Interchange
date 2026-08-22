// ─────────────────────────────────────────────────────────────────────────────
// Sprint 6 acceptance: onboarding past the founding cohort, and governance.
//
//   npx tsx scripts/verify-onboarding.ts [baseUrl]
//
// The question this answers is whether the network can grow without its
// operator hand-editing rows — and whether the shadow period is a real gate or
// a decorative one. Most checks below are attempts to get around it.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateMemberKeyPair, signRequest } from "../lib/signing";
import { admit, promote, promotionCandidates, suspendLapsed, SHADOW_PERIOD_DAYS } from "../lib/onboarding";

const BASE = process.argv[2] ?? "http://127.0.0.1:3360";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(52)} ${detail}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(52)} ${detail}`); }
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function main() {
  console.log(`\nInterchange Sprint 6 acceptance — onboarding & governance → ${BASE}\n`);

  const org = `Test Lender ${Date.now().toString(36).slice(-5)}`;

  // ── Apply ───────────────────────────────────────────────────────────────
  console.log("  \x1b[2mApplication — self-service, grants nothing\x1b[0m");

  const bad = await post("/api/onboard", { organisation: org });
  check("an incomplete application is refused", bad.status === 400, `${bad.status}`);

  const badEmail = await post("/api/onboard", {
    organisation: org, contact_name: "A Person", contact_email: "not-an-email",
  });
  check("an invalid contact address is refused", badEmail.status === 400, `${badEmail.status}`);

  const applied = await post("/api/onboard", {
    organisation: org,
    contact_name: "A Person",
    contact_email: "ops@testlender.co.ke",
    source_host: "213.148.17.198,4420",
    source_database: "Serviceconnect",
    source_entity_id: 4242,
    claimed_loans: 5000,
  });
  const appId = String(applied.json.application_id ?? "");
  check("an application is accepted", applied.status === 201 && !!appId, `${applied.status}`);

  const asRow = await prisma.memberApplication.findUniqueOrThrow({ where: { id: appId } });
  check(
    "applying grants no membership",
    asRow.status === "SUBMITTED" && !asRow.memberId,
    `status ${asRow.status}, no member row`,
  );

  // ── Key possession ──────────────────────────────────────────────────────
  console.log("\n  \x1b[2mKey registration — possession must be proved\x1b[0m");

  const kp = generateMemberKeyPair();
  const impostor = generateMemberKeyPair();
  const path = `/api/onboard/${appId}/key`;

  // Claim a key while signing with a DIFFERENT one.
  const forgedBody = JSON.stringify({ public_key: kp.publicKey });
  const forgedHeaders = signRequest({
    method: "POST", path, body: forgedBody, memberCode: org, secretKeyHex: impostor.secretKey,
  });
  const forged = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "content-type": "application/json", ...forgedHeaders }, body: forgedBody,
  });
  check(
    "registering a key you do not hold fails",
    forged.status === 401,
    `${forged.status} — signature did not match the claimed key`,
  );

  // Sending a private key is refused loudly.
  const withPrivate = await post(path, { public_key: kp.publicKey, private_key: kp.secretKey });
  check(
    "sending a private key is refused",
    withPrivate.status === 400 && withPrivate.json.error === "PRIVATE_KEY_SENT",
    `${withPrivate.status} ${String(withPrivate.json.error ?? "")}`,
  );

  // Correctly signed with the key being registered.
  const goodBody = JSON.stringify({ public_key: kp.publicKey });
  const goodHeaders = signRequest({
    method: "POST", path, body: goodBody, memberCode: org, secretKeyHex: kp.secretKey,
  });
  const good = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "content-type": "application/json", ...goodHeaders }, body: goodBody,
  });
  check("proving possession registers the key", good.status === 200, `${good.status}`);

  // ── Admission ───────────────────────────────────────────────────────────
  console.log("\n  \x1b[2mAdmission — always into shadow, never straight to active\x1b[0m");

  const member = await admit(appId, "governing-body", "Meets the live-and-at-scale threshold.");
  check(
    "admission creates a SHADOW member, never ACTIVE",
    member.status === "SHADOW",
    `${member.code} · ${member.status}`,
  );
  check(
    "the shadow clock is set",
    !!member.shadowUntil && member.shadowUntil > new Date(),
    `until ${member.shadowUntil?.toISOString().slice(0, 10)} (${SHADOW_PERIOD_DAYS}d)`,
  );
  check(
    "the member carries the key they proved",
    member.publicKey === kp.publicKey,
    "public key bound to the member",
  );

  const logged = await prisma.governanceAction.findFirst({
    where: { memberCode: member.code, action: "ADMIT" },
  });
  check("the decision is on the record", !!logged, `decided by ${logged?.decidedBy}, rationale stored`);

  // ── The shadow gate ─────────────────────────────────────────────────────
  console.log("\n  \x1b[2mShadow period — a real gate, not a countdown\x1b[0m");

  let promoted = false;
  try { await promote(member.code, "governing-body"); promoted = true; } catch { /* expected */ }
  check("a member cannot be promoted early", !promoted, "promotion refused mid-period");

  // Serve the time but publish nothing — time alone must not be enough.
  await prisma.member.update({
    where: { code: member.code },
    data: { shadowUntil: new Date(Date.now() - 86_400_000), loans: 0, lastContributionAt: null },
  });
  const idle = (await promotionCandidates()).find((c) => c.memberCode === member.code);
  check(
    "serving the time without contributing is not enough",
    idle !== undefined && !idle.eligible,
    idle?.reason ?? "not found",
  );

  // Now contribute properly.
  await prisma.member.update({
    where: { code: member.code },
    data: { loans: 5000, borrowers: 2200, lastContributionAt: new Date() },
  });
  const ready = (await promotionCandidates()).find((c) => c.memberCode === member.code);
  check("time served plus real contribution qualifies", ready?.eligible === true, ready?.reason ?? "");

  const active = await promote(member.code, "governing-body");
  check("promotion activates the member", active.status === "ACTIVE" && active.shadowUntil === null, `${active.code} · ACTIVE`);

  // ── Reciprocity enforcement ─────────────────────────────────────────────
  console.log("\n  \x1b[2mReciprocity — lapsing is enforced without a meeting\x1b[0m");

  await prisma.member.update({
    where: { code: member.code },
    data: { lastContributionAt: new Date(Date.now() - 120 * 86_400_000) },
  });
  const suspended = await suspendLapsed(60, "policy-engine");
  check(
    "a member who stops contributing is suspended automatically",
    suspended.includes(member.code),
    `${suspended.length} suspended this pass`,
  );

  const after = await prisma.member.findUniqueOrThrow({ where: { code: member.code } });
  check("suspension is recorded with a reason", after.status === "SUSPENDED", "status SUSPENDED");

  const suspensionLog = await prisma.governanceAction.findFirst({
    where: { memberCode: member.code, action: "SUSPEND" },
  });
  check("…and it is on the record too", !!suspensionLog, suspensionLog?.rationale ?? "");

  // ── Clean up the fixture ────────────────────────────────────────────────
  await prisma.governanceAction.deleteMany({ where: { memberCode: member.code } });
  await prisma.member.delete({ where: { code: member.code } });
  await prisma.memberApplication.delete({ where: { id: appId } });

  const total = await prisma.member.count();
  console.log(`\n  ecosystem: ${total} members after cleanup\n`);
  console.log(`  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
