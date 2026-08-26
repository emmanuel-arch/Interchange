// Who is in the Registry right now, and what is each member wired to?
//
//   npx tsx scripts/registry-status.ts
//
// Members, keys, source books, holdings and published filters, in one read. This
// is the first thing to run before onboarding a member — it says what the
// network already believes, so nothing is registered twice under a new code.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const members = await prisma.member.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true, code: true, name: true, status: true, publicKey: true,
      sourceHost: true, sourceDatabase: true, sourceEntityId: true,
    },
  });

  const [holdings, filters, services] = await Promise.all([
    prisma.memberHolding.groupBy({ by: ["memberId"], _count: { _all: true } }),
    prisma.memberFilter.groupBy({ by: ["memberId"], _max: { generation: true }, _count: { _all: true } }),
    prisma.service.findMany({ select: { code: true, live: true, requiredScopes: true } }),
  ]);

  const held = new Map(holdings.map((h) => [h.memberId, h._count._all]));
  const filt = new Map(filters.map((f) => [f.memberId, f._max.generation]));

  console.log(`\n\x1b[1mRegistry — ${members.length} members\x1b[0m`);
  console.log(
    `\x1b[2m  ${"code".padEnd(16)} ${"name".padEnd(30)} ${"status".padEnd(9)} ${"key".padEnd(4)}` +
      ` ${"entity".padStart(6)} ${"holdings".padStart(9)} ${"filter".padStart(7)}  source host\x1b[0m`,
  );
  for (const m of members) {
    console.log(
      `  ${m.code.padEnd(16)} ${String(m.name).slice(0, 30).padEnd(30)} ${m.status.padEnd(9)}` +
        ` ${(m.publicKey ? "yes" : "—").padEnd(4)} ${String(m.sourceEntityId ?? "—").padStart(6)}` +
        ` ${String(held.get(m.id) ?? 0).padStart(9)} ${String(filt.get(m.id) ?? "—").padStart(7)}` +
        `  ${m.sourceHost ?? "\x1b[2m(none — synthetic)\x1b[0m"}`,
    );
  }

  console.log(`\n\x1b[1mServices\x1b[0m`);
  for (const s of services) {
    console.log(`  ${s.code.padEnd(20)} ${s.live ? "\x1b[32mlive\x1b[0m" : "\x1b[2mspecified\x1b[0m"}  ${s.requiredScopes.join(", ")}`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
