// ─────────────────────────────────────────────────────────────────────────────
// Prove the message log is tamper-EVIDENT, not merely append-only.
//
//   npx tsx scripts/verify-tamper.ts
//
// "Tamper-evident" is a claim. This is the evidence: it edits the database
// directly — as an attacker with database access would, bypassing every
// application check — and confirms the chain notices. Then it puts the row back
// and confirms the chain is clean again, so running this leaves nothing behind.
//
// Three attacks, because they fail in different ways:
//   · EDIT   a row's contents        → its own hash stops matching
//   · REWRITE a row's hash to match  → the NEXT row's prevHash stops matching
//   · DELETE a row                   → the sequence gaps
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyChain, entryHash } from "../lib/messagelog";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(48)} ${detail}`);
  } else {
    fail++;
    console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(48)} ${detail}`);
  }
}

async function main() {
  console.log("\nMessage log tamper detection\n");

  const entries = await prisma.messageLogEntry.findMany({ orderBy: { seq: "asc" } });
  if (entries.length < 2) {
    console.error("Need at least 2 entries. Run verify-exchange.ts first.");
    process.exit(1);
  }

  const baseline = await verifyChain();
  check("chain starts intact", baseline.ok, `${baseline.checked} entries`);

  const victim = entries[0];

  // ── Attack 1: edit the contents ─────────────────────────────────────────
  // Raw SQL on purpose: this must bypass every application-level guard, the way
  // someone with database credentials would.
  await prisma.$executeRaw`UPDATE "MessageLogEntry" SET "outcome" = 'TAMPERED' WHERE "seq" = ${victim.seq}`;

  const afterEdit = await verifyChain();
  check(
    "editing a row's contents is detected",
    !afterEdit.ok && afterEdit.brokenAt === victim.seq,
    afterEdit.reason ?? "not detected",
  );

  // ── Attack 2: rewrite the hash so the row matches itself again ──────────
  // A sophisticated attacker would not stop at attack 1. Recompute the hash so
  // the edited row is internally consistent — the break then moves DOWNSTREAM,
  // which is exactly what chaining buys.
  const edited = await prisma.messageLogEntry.findUniqueOrThrow({ where: { seq: victim.seq } });
  const consistentHash = entryHash(edited.prevHash, edited.seq, edited.at, {
    callerCode: edited.callerCode,
    serviceCode: edited.serviceCode,
    subjectToken: edited.subjectToken,
    consentRef: edited.consentRef,
    outcome: edited.outcome,
    requestDigest: edited.requestDigest,
    responseDigest: edited.responseDigest,
    callerSignature: edited.callerSignature,
  });
  await prisma.$executeRaw`UPDATE "MessageLogEntry" SET "hash" = ${consistentHash} WHERE "seq" = ${victim.seq}`;

  const afterRehash = await verifyChain();
  check(
    "re-hashing to cover the edit is still detected",
    !afterRehash.ok && afterRehash.brokenAt !== null && afterRehash.brokenAt > victim.seq,
    `break moved downstream to entry ${afterRehash.brokenAt?.toString()}`,
  );

  // ── Restore ─────────────────────────────────────────────────────────────
  await prisma.$executeRaw`UPDATE "MessageLogEntry" SET "outcome" = ${victim.outcome}, "hash" = ${victim.hash} WHERE "seq" = ${victim.seq}`;
  const restored = await verifyChain();
  check("chain restored after the test", restored.ok, `${restored.checked} entries`);

  // ── Attack 3: delete a row ──────────────────────────────────────────────
  const removed = await prisma.messageLogEntry.findUniqueOrThrow({ where: { seq: victim.seq } });
  await prisma.messageLogEntry.delete({ where: { seq: victim.seq } });

  const afterDelete = await verifyChain();
  check(
    "deleting a row is detected as a sequence gap",
    !afterDelete.ok,
    afterDelete.reason ?? "not detected",
  );

  await prisma.messageLogEntry.create({ data: removed });
  const final = await verifyChain();
  check("chain restored after deletion test", final.ok, `${final.checked} entries`);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
