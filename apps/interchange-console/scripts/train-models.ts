// Train the champion and challenger, and register them.
//
//   npx tsx scripts/train-models.ts
//
// The logistic scorecard is registered as CHAMPION and the tree ensemble as
// CHALLENGER — not because trees are worse in general, but because with a few
// hundred labelled rows they memorise, and because the champion's contributions
// are exact rather than approximated. Promotion is decided by measured lift on
// held-out data, in comparePromotion(), not here.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { train, monotonicityViolations } from "../lib/scoring/train";
import { register, comparePromotion } from "../lib/scoring/registry";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  console.log("\nTraining on labelled decisions — out-of-time split\n");

  for (const algorithm of ["logistic", "trees"] as const) {
    const r = await train(algorithm);
    const m = r.metrics;
    console.log(`${algorithm.toUpperCase()}`);
    console.log(`  train rows      ${r.trainRows} (${m.ecosystemRows} recovered from rejects)`);
    console.log(`  train window    ${r.trainStart.toISOString().slice(0, 10)} → ${r.trainEnd.toISOString().slice(0, 10)}`);
    console.log(`  test window     ${r.testStart.toISOString().slice(0, 10)} → ${r.testEnd.toISOString().slice(0, 10)}  (${m.n} rows, ${m.bads} bad)`);
    console.log(`  AUC ${m.auc.toFixed(3)}   KS ${m.ks.toFixed(3)}   Gini ${m.gini.toFixed(3)}`);

    const bad = monotonicityViolations(r.params);
    if (bad.length) {
      console.log(`  ⚠ monotonicity: ${bad.join("; ")}`);
    } else if (algorithm === "logistic") {
      console.log(`  ✓ every declared feature direction respected`);
    }

    await register(r, algorithm === "logistic" ? "CHAMPION" : "CHALLENGER");
    console.log(`  registered as   ${algorithm === "logistic" ? "CHAMPION" : "CHALLENGER"} · ${r.version}\n`);
  }

  for (const c of await comparePromotion()) {
    console.log(`promotion: ${c.challengerVersion} → ${c.verdict.toUpperCase()} — ${c.reason}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
