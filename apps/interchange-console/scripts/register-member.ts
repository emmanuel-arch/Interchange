// ─────────────────────────────────────────────────────────────────────────────
// Register a member and the book its node reads.
//
//   npx tsx scripts/register-member.ts --code "KE/LENDER/AXE-3003" \
//     --name "Axe - Boresha" --host "100.103.154.73,4420" --entity 3003 \
//     --public-key <hex> [--database Serviceconnect] [--status SHADOW]
//
// Only the PUBLIC key is accepted, and only the public key is stored. The
// private half is minted inside the member's node and never leaves it — see
// the node's own interchange-keygen script.
//
// ── WHY A NEW MEMBER STARTS IN SHADOW ────────────────────────────────────────
// SHADOW contributes but cannot query. That is not a formality: reciprocity is
// the network's only real currency, and a member admitted straight to ACTIVE
// could read the whole ecosystem's exposure on day one having published nothing.
// The policy engine promotes them once they have actually contributed, which is
// enforced in lib/onboarding.ts rather than in a contract.
//
// ── MEMBER CODES MUST BE GLOBALLY UNIQUE, AND ENTITY IDS ARE NOT ─────────────
// EntityId 3003 is "Micromart Check off" on Micromart's server and "Axe -
// Boresha" on Axe's. A bare KE/LENDER/3003 therefore names two different
// lenders. This script refuses a code that is already registered against a
// DIFFERENT source book rather than quietly repointing it — silently moving a
// member's code to another company's database is the worst outcome available.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { PrismaClient, type MemberStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const code = arg("code");
  const name = arg("name");
  const host = arg("host");
  const database = arg("database") ?? "Serviceconnect";
  const entity = arg("entity");
  const publicKey = arg("public-key");
  const status = (arg("status") ?? "SHADOW") as MemberStatus;

  if (!code || !name || !host || !entity) {
    console.error(
      "\nRequired: --code --name --host --entity. Optional: --database --public-key --status\n",
    );
    process.exit(2);
  }
  const entityId = Number(entity);
  if (!Number.isInteger(entityId)) {
    console.error("\n--entity must be an integer EntityId.\n");
    process.exit(2);
  }
  if (publicKey && !/^[0-9a-f]{64}$/i.test(publicKey)) {
    console.error("\n--public-key must be a 64-character hex Ed25519 public key.\n");
    process.exit(2);
  }

  // A code already pointed at a different book is a collision, not an update.
  const byCode = await prisma.member.findUnique({ where: { code } });
  if (
    byCode &&
    byCode.sourceEntityId != null &&
    (byCode.sourceEntityId !== entityId || (byCode.sourceHost ?? host) !== host)
  ) {
    console.error(
      `\nRefusing: ${code} is already registered against ${byCode.sourceHost} entity ${byCode.sourceEntityId}.\n` +
        `Member codes must be globally unique. Pick a code that is not already taken.\n`,
    );
    process.exit(1);
  }

  // And the same book registered under a second code would double-count that
  // lender's exposure in every ecosystem total.
  const byBook = await prisma.member.findFirst({
    where: { sourceHost: host, sourceDatabase: database, sourceEntityId: entityId },
  });
  if (byBook && byBook.code !== code) {
    console.error(
      `\nRefusing: ${host} entity ${entityId} is already registered as ${byBook.code} (${byBook.name}).\n` +
        `One book, one member — two codes over one book would double-count its exposure.\n`,
    );
    process.exit(1);
  }

  const member = await prisma.member.upsert({
    where: { code },
    create: {
      code,
      name,
      status,
      sourceHost: host,
      sourceDatabase: database,
      sourceEntityId: entityId,
      ...(publicKey ? { publicKey, keyRegisteredAt: new Date() } : {}),
      ...(status === "ACTIVE" ? { joinedAt: new Date() } : {}),
    },
    update: {
      name,
      status,
      sourceHost: host,
      sourceDatabase: database,
      sourceEntityId: entityId,
      ...(publicKey ? { publicKey, keyRegisteredAt: new Date() } : {}),
    },
  });

  // Without a subscription the gate refuses every call with REFUSED_QUOTA, which
  // reads like a bug rather than a missing setup step. Exposure is the service
  // every member joins for, so it is created here with a contribution-linked
  // free tier rather than left for someone to remember.
  const exposure = await prisma.service.findUnique({ where: { code: "exposure-v1" } });
  if (exposure) {
    await prisma.subscription.upsert({
      where: { memberId_serviceId: { memberId: member.id, serviceId: exposure.id } },
      create: { memberId: member.id, serviceId: exposure.id, active: true, freeTierPerDay: 1_000 },
      update: { active: true },
    });
  }

  console.log(
    `\n\x1b[32m✓\x1b[0m ${member.code} — ${member.name}` +
      `\n  status      ${member.status}${member.status === "SHADOW" ? " \x1b[2m(contributes, cannot yet query)\x1b[0m" : ""}` +
      `\n  book        ${member.sourceHost} · ${member.sourceDatabase} · entity ${member.sourceEntityId}` +
      `\n  key         ${member.publicKey ? "registered" : "\x1b[33mnone — this member cannot sign a request yet\x1b[0m"}` +
      `\n  exposure-v1 ${exposure ? "subscribed" : "\x1b[33mservice not in the Directory\x1b[0m"}\n`,
  );
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
