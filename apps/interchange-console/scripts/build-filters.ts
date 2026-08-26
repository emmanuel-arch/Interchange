// ─────────────────────────────────────────────────────────────────────────────
// Publish each member's Bloom filter.
//
//   npx tsx scripts/build-filters.ts
//
// In production a member's node builds this itself, over its own book, and
// uploads it every 15 minutes — the Registry never sees the token list, only the
// resulting bit array. Here it is built centrally over the MemberHolding
// stand-in, which is the one part of this that is not yet faithful.
//
// Generations increment rather than overwrite, so a node that is mid-download
// during a rebuild still has a complete previous filter to screen against.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { build, saturation, mightContain } from "../lib/bloom";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Target false-positive rate. 1% keeps needless fan-out rare without bloating. */
const TARGET_FPR = 0.01;

async function main() {
  const members = await prisma.member.findMany({
    where: { status: { in: ["ACTIVE", "SHADOW"] } },
    select: { id: true, code: true, holdingGeneration: true },
    orderBy: { code: "asc" },
  });

  console.log("member                 items    bits    k   fill   generation");
  console.log("─".repeat(64));

  for (const m of members) {
    // Only the generation currently being SERVED. Holdings from a superseded
    // publication are still on disk until the swap cleans them up, and a filter
    // built across both would advertise borrowers this member no longer holds.
    if (m.holdingGeneration === 0) {
      console.log(`${m.code.padEnd(20)} ${"—".padStart(6)} ${"(no book published)".padStart(30)}`);
      continue;
    }

    const holdings = await prisma.memberHolding.findMany({
      where: { memberId: m.id, generation: m.holdingGeneration, activeLoans: { gt: 0 } },
      select: { subjectToken: true },
    });
    const tokens = holdings.map((h) => h.subjectToken);

    const { bits, params, itemCount } = build(tokens, TARGET_FPR);

    // ── SELF-CHECK ──────────────────────────────────────────────────────────
    // A Bloom filter must never report absent for something it was built from.
    // That property is the entire reason this structure was chosen over a cache
    // or a sample, and it held right up until a signed-integer stride broke it
    // for 42% of tokens without raising anything. Verifying it here costs one
    // pass over the tokens and converts a silent, invisible wrong answer into a
    // loud refusal to publish.
    const missing = tokens.filter((t) => !mightContain(bits, params, t));
    if (missing.length > 0) {
      throw new Error(
        `[bloom] ${m.code}: filter reports ${missing.length} of ${tokens.length} of its OWN tokens as absent. ` +
          `Refusing to publish — this would screen real lenders out of the fan-out.`,
      );
    }

    const last = await prisma.memberFilter.findFirst({
      where: { memberId: m.id },
      orderBy: { generation: "desc" },
      select: { generation: true },
    });
    const generation = (last?.generation ?? 0) + 1;

    await prisma.memberFilter.create({
      data: { memberId: m.id, generation, bits: new Uint8Array(bits), k: params.k, m: params.m, itemCount },
    });

    console.log(
      `${m.code.padEnd(20)} ${String(itemCount).padStart(6)} ${String(params.m).padStart(7)} ${String(params.k).padStart(4)} ${(saturation(bits, params.m) * 100).toFixed(1).padStart(6)}% ${String(generation).padStart(6)}`,
    );
  }

  // Keep the last two generations. Older ones are dead weight, but dropping to
  // one would leave a node mid-download with nothing valid to fall back to.
  for (const m of members) {
    const keep = await prisma.memberFilter.findMany({
      where: { memberId: m.id },
      orderBy: { generation: "desc" },
      take: 2,
      select: { id: true },
    });
    await prisma.memberFilter.deleteMany({
      where: { memberId: m.id, id: { notIn: keep.map((k) => k.id) } },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
