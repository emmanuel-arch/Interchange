// ─────────────────────────────────────────────────────────────────────────────
// Seed the MemberHolding stand-in with a realistic overlapping population.
//
//   npx tsx scripts/seed-holdings.ts
//
// The point of the ecosystem is that borrowers OVERLAP — the whole product is
// answering "who else is lending to this person right now". A seed where every
// borrower sits with exactly one member would make the exposure engine look like
// it works while proving nothing.
//
// So the population below is built deliberately:
//   · a large base of single-lender borrowers (most people)
//   · a meaningful slice with 2–3 lenders
//   · a small, dangerous tail of loan-stackers with 4–5 lenders and recent
//     disbursements — the ones the product exists to catch
//
// Tokens are derived through the real OPRF, so they match what a node would
// compute for the same identifier.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { canonicalIdentifier } from "../lib/oprf/node";
import { evaluateDirect } from "../lib/oprf/registry";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * Derive tokens directly with the ecosystem key. A node cannot do this — it must
 * go through the blinded exchange — but a seeder legitimately holds the key, and
 * the blinded round trip and a local blind/evaluate/finalize yield the same token.
 */
function tokenFor(nationalId: string): string {
  const input = new TextEncoder().encode(canonicalIdentifier("national_id", nationalId));
  return evaluateDirect(process.env.INTERCHANGE_OPRF_KEY!, input);
}

const BUCKETS = ["prepayment", "due", "watch_1", "watch_2", "watch_3", "npl"];

// Deterministic PRNG so the seeded population is reproducible run to run.
let seed = 20260822;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const between = (lo: number, hi: number) => Math.floor(lo + rnd() * (hi - lo));

async function main() {
  if (!process.env.INTERCHANGE_OPRF_KEY) {
    console.error("INTERCHANGE_OPRF_KEY is not set — run scripts/generate-keys.ts first.");
    process.exit(1);
  }

  const members = await prisma.member.findMany({
    where: { status: { in: ["ACTIVE", "SHADOW"] } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  if (members.length < 3) {
    console.error("Need at least 3 active/shadow members. Run db:seed first.");
    process.exit(1);
  }

  await prisma.memberHolding.deleteMany();

  const rows: {
    memberId: string;
    subjectToken: string;
    activeLoans: number;
    outstandingKes: number;
    worstBucket: string;
    newestDisbursedAt: Date;
  }[] = [];

  const now = Date.now();
  let stackers = 0;

  // 400 synthetic borrowers, national IDs 30000000+.
  for (let i = 0; i < 400; i++) {
    const nationalId = String(30_000_000 + i * 7);
    const token = tokenFor(nationalId);

    // Distribution: 70% one lender, 22% two or three, 8% four or five.
    const r = rnd();
    const lenderCount = r < 0.7 ? 1 : r < 0.92 ? between(2, 4) : between(4, 6);
    if (lenderCount >= 4) stackers++;

    const shuffled = [...members].sort(() => rnd() - 0.5).slice(0, lenderCount);

    for (const m of shuffled) {
      // Stackers borrow recently and sit in worse buckets — that correlation is
      // the signal the score is meant to learn, so the fixture has to contain it.
      const recent = lenderCount >= 4 ? between(0, 14) : between(0, 200);
      const bucketIdx = lenderCount >= 4 ? between(2, 6) : between(0, 4);
      rows.push({
        memberId: m.id,
        subjectToken: token,
        activeLoans: between(1, 3),
        outstandingKes: between(2_000, lenderCount >= 4 ? 80_000 : 45_000),
        worstBucket: BUCKETS[Math.min(bucketIdx, BUCKETS.length - 1)],
        newestDisbursedAt: new Date(now - recent * 86_400_000),
      });
    }
  }

  // The one borrower we can look up by hand in a demo.
  const demoToken = tokenFor("39362808");
  for (const m of members.slice(0, 4)) {
    rows.push({
      memberId: m.id,
      subjectToken: demoToken,
      activeLoans: between(1, 3),
      outstandingKes: between(15_000, 60_000),
      worstBucket: pick(["due", "watch_1", "watch_2", "watch_3"]),
      newestDisbursedAt: new Date(now - between(1, 12) * 86_400_000),
    });
  }

  await prisma.memberHolding.createMany({ data: rows });

  console.log(`members         : ${members.length}`);
  console.log(`borrowers       : 401 (400 synthetic + demo 39362808)`);
  console.log(`holdings        : ${rows.length}`);
  console.log(`loan-stackers   : ${stackers} borrowers with 4+ lenders`);
  console.log(`demo token      : ${demoToken.slice(0, 12)}… across ${Math.min(4, members.length)} members`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
