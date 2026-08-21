// ─────────────────────────────────────────────────────────────────────────────
// Development key material.
//
//   npx tsx scripts/generate-keys.ts
//
// Generates the ecosystem OPRF key and an Ed25519 keypair per member, registers
// the PUBLIC keys in the Registry, and writes the private keys to
// `.member-keys.json` so the test harness can act as a member node.
//
// ⚠ THIS IS A DEVELOPMENT FIXTURE AND NOTHING ELSE.
//
// In production no member's private key is ever generated here, seen here, or
// stored here. The member generates it inside their own node, keeps it, and
// sends only the public half — that is the entire point of signing rather than
// sharing a secret. A file containing every member's private key would let its
// holder impersonate the whole ecosystem.
//
// The ecosystem OPRF key is similar but worse: it belongs in a KMS or HSM, and
// because rotating it re-tokenises every borrower in the ecosystem, it is
// effectively unrotatable once real data exists. Decide custody before launch.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateMemberKeyPair } from "../lib/signing";
import { generateEcosystemKey } from "../lib/oprf/registry";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const KEYFILE = ".member-keys.json";

async function main() {
  // ── Ecosystem OPRF key ──────────────────────────────────────────────────
  if (process.env.INTERCHANGE_OPRF_KEY) {
    console.log("ecosystem OPRF key : already set in .env, left alone");
    console.log("                     (regenerating it would orphan every existing token)");
  } else {
    const eco = generateEcosystemKey();
    console.log("\n⚠ No INTERCHANGE_OPRF_KEY found. Add this line to .env:\n");
    console.log(`INTERCHANGE_OPRF_KEY="${eco.secretKey}"\n`);
  }

  // ── Member keypairs ─────────────────────────────────────────────────────
  const existing: Record<string, { secretKey: string; publicKey: string }> = existsSync(KEYFILE)
    ? JSON.parse(readFileSync(KEYFILE, "utf8"))
    : {};

  const members = await prisma.member.findMany({ orderBy: { code: "asc" } });
  let created = 0;

  for (const m of members) {
    let kp = existing[m.code];
    if (!kp) {
      kp = generateMemberKeyPair();
      existing[m.code] = kp;
      created++;
    }
    if (m.publicKey !== kp.publicKey) {
      await prisma.member.update({
        where: { id: m.id },
        data: { publicKey: kp.publicKey, keyRegisteredAt: new Date() },
      });
    }
  }

  writeFileSync(KEYFILE, JSON.stringify(existing, null, 2));

  console.log(`member keypairs    : ${members.length} registered (${created} newly generated)`);
  console.log(`private keys       : ${KEYFILE} — gitignored, development only`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
