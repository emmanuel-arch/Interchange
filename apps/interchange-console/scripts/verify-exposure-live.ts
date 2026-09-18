// ─────────────────────────────────────────────────────────────────────────────
// EXPOSURE ON REAL BOOKS — does the launch product actually answer, and how fast?
//
//   npx tsx scripts/verify-exposure-live.ts [baseUrl] [--runs 40] [--caller KE/LENDER/3005]
//
// Everything about the exposure engine was previously proven against four
// hundred invented borrowers. This runs it against the books that were ingested
// from live Serviceconnect, and it does two things that a fixture cannot:
//
//   1. FINDS THE OVERLAP. Which borrowers are held by more than one member? That
//      is computed from PUBLISHED TOKENS ALONE — no identifier exists anywhere in
//      this query, and nobody, including whoever runs it, learns who these people
//      are. It is also the single most commercially important number in the
//      product: an ecosystem with no overlap answers nothing worth paying for.
//
//   2. MEASURES THE BUDGET HONESTLY. The blueprint's acceptance is p95 under
//      400ms. That number assumes each node reads a book inside its own
//      perimeter. In this topology every node is served by one app whose
//      Postgres is in Ireland, so most of the measured time is distance rather
//      than design — and the report separates screen time, fan-out time and the
//      round trip so the difference is visible instead of averaged away.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { readFileSync } from "fs";
import { prisma } from "../lib/prisma";
import { fetchFilters, queryExposure } from "../lib/exposure/broker";
import { tokenPreview } from "../lib/oprf/node";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? process.env.INTERCHANGE_SELF_URL ?? "http://127.0.0.1:3341";
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "40"));
const CALLER = arg("caller", "KE/LENDER/3005");

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  console.log(`\n\x1b[1mExposure on real books\x1b[0m \x1b[2m→ ${BASE}, as ${CALLER}\x1b[0m\n`);

  const members = await prisma.member.findMany({
    where: { status: { in: ["ACTIVE", "SHADOW"] } },
    select: { id: true, code: true, name: true, holdingGeneration: true, holdingsPublishedAt: true },
  });
  const publishing = members.filter((m) => m.holdingGeneration > 0);

  console.log("  \x1b[2mContributing members\x1b[0m");
  for (const m of publishing) {
    const n = await prisma.memberHolding.count({ where: { memberId: m.id, generation: m.holdingGeneration } });
    console.log(
      `    ${m.code.padEnd(20)} ${String(n).padStart(7)} borrowers  \x1b[2mgen ${m.holdingGeneration} · ` +
        `${m.holdingsPublishedAt?.toISOString().slice(0, 16).replace("T", " ")}\x1b[0m`,
    );
  }
  if (publishing.length < 2) {
    console.log("\n  \x1b[33mFewer than two members have published. Exposure needs at least two books to mean anything.\x1b[0m\n");
  }

  // ── 1. The overlap, from tokens alone ─────────────────────────────────────
  // Only rows in each member's CURRENTLY SERVED generation count. Older
  // generations are still on disk until they are dropped, and counting them
  // would invent exposure that no member is serving.
  const served = publishing.map((m) => ({ memberId: m.id, generation: m.holdingGeneration }));
  const overlaps = await prisma.$queryRawUnsafe<{ subjectToken: string; members: bigint }[]>(
    `SELECT "subjectToken", COUNT(DISTINCT "memberId") AS members
       FROM "MemberHolding"
      WHERE "activeLoans" > 0 AND (${served.map((_, i) => `("memberId" = $${i * 2 + 1} AND "generation" = $${i * 2 + 2})`).join(" OR ")})
      GROUP BY "subjectToken"
     HAVING COUNT(DISTINCT "memberId") > 1
      ORDER BY COUNT(DISTINCT "memberId") DESC
      LIMIT 500`,
    ...served.flatMap((s) => [s.memberId, s.generation]),
  );

  const totalHeld = await prisma.memberHolding.count({
    where: { OR: served.map((s) => ({ memberId: s.memberId, generation: s.generation })) },
  });

  console.log(
    `\n  \x1b[1mOverlap\x1b[0m  ${overlaps.length >= 500 ? "500+" : overlaps.length} borrowers are held by more than one member` +
      `  \x1b[2m(of ${totalHeld.toLocaleString()} positions published)\x1b[0m`,
  );
  if (overlaps.length === 0) {
    console.log(
      "  \x1b[33mNo borrower appears in two books. Either the second member has not published, or these\x1b[0m\n" +
        "  \x1b[33mpopulations genuinely do not intersect — worth knowing either way before a demo.\x1b[0m\n",
    );
  }

  // ── 2. The query, measured ────────────────────────────────────────────────
  const keys = JSON.parse(readFileSync(".member-keys.json", "utf8")) as Record<string, { secretKey: string }>;
  if (!keys[CALLER]) throw new Error(`No development key for ${CALLER}.`);

  const filters = await fetchFilters(BASE);
  console.log(
    `  \x1b[2mfilters   ${filters.length} published · ${filters.map((f) => `${f.member_code.replace("KE/LENDER/", "")}:${f.item_count}`).join(" · ")}\x1b[0m`,
  );

  const subjects = overlaps.slice(0, RUNS).map((o) => o.subjectToken);
  // Pad with single-member holdings so the timing sample is not made up only of
  // the rare multi-lender case, which is the slowest path and would flatter
  // nothing but would misrepresent the typical query.
  if (subjects.length < RUNS) {
    const extra = await prisma.memberHolding.findMany({
      where: { OR: served.map((s) => ({ memberId: s.memberId, generation: s.generation })), activeLoans: { gt: 0 } },
      select: { subjectToken: true },
      take: RUNS - subjects.length,
    });
    subjects.push(...extra.map((e) => e.subjectToken));
  }

  if (subjects.length === 0) {
    console.log("\n  Nothing published to query. Run the ingest first.\n");
    return;
  }

  console.log(`\n  \x1b[2mRunning ${subjects.length} exposure queries…\x1b[0m`);
  const totals: number[] = [];
  const fanouts: number[] = [];
  const screens: number[] = [];
  let found = 0;
  let partial = 0;
  let multiLender = 0;
  const sample: string[] = [];
  /** Why members went silent, counted across every run. */
  const silence: Record<string, number> = { timeout: 0, unpublished: 0, error: 0 };

  for (const subjectToken of subjects) {
    const t0 = Date.now();
    const r = await queryExposure({
      baseUrl: BASE,
      callerCode: CALLER,
      callerSecretKey: keys[CALLER].secretKey,
      memberCodes: members.map((m) => m.code),
      filters,
      subjectToken,
      discloseLenders: true,
    });
    totals.push(Date.now() - t0);
    fanouts.push(r.timings.fanoutMs);
    screens.push(r.timings.screenMs);
    if (r.lenders > 0) found++;
    if (r.partial) partial++;
    for (const s of r.silent) silence[s.reason] = (silence[s.reason] ?? 0) + 1;
    if (r.lenders > 1) {
      multiLender++;
      if (sample.length < 3) {
        sample.push(
          `${tokenPreview(subjectToken)}  ${r.activeLoans} loans · ${r.lenders} lenders · ${r.outstandingBand} · ` +
            `worst ${r.worstBucket}${r.lendersNamed ? ` · ${r.lendersNamed.join(", ")}` : ""}`,
        );
      }
    }
  }

  console.log(`\n  \x1b[1mLatency\x1b[0m   p50 ${percentile(totals, 50)}ms · p95 ${percentile(totals, 95)}ms · max ${Math.max(...totals)}ms`);
  console.log(`  \x1b[2m          screening p95 ${percentile(screens, 95)}ms · fan-out p95 ${percentile(fanouts, 95)}ms\x1b[0m`);
  console.log(`  \x1b[1mAnswers\x1b[0m   ${found}/${subjects.length} had exposure · ${multiLender} at more than one lender · ${partial} partial`);
  if (sample.length) {
    console.log("\n  \x1b[2mBorrowers carrying exposure at several members:\x1b[0m");
    for (const s of sample) console.log(`    ${s}`);
  }

  // ── The verdict has TWO conditions, and speed is the lesser one ───────────
  //
  // A fan-out where every member times out is FAST and worthless: it returns in
  // well under the budget, reports `partial`, and finds nothing. An acceptance
  // check that prints a green tick for that is doing the exact thing the broker
  // is written to never do — presenting an absence of answers as an answer.
  //
  // So the budget is only meaningful when members actually answered.
  // ── The verdict has TWO conditions, and speed is the lesser one ───────────
  //
  // A fan-out where every member times out is FAST and worthless: it returns
  // well inside the budget, reports `partial`, and finds nothing. An acceptance
  // check that prints a green tick for that is doing the exact thing the broker
  // exists to never do — presenting an absence of answers as an answer.
  //
  // So silence is broken down by CAUSE. A member that has never published is a
  // known gap in coverage; a member that timed out is an outage. Only the second
  // one invalidates the measurement.
  const p95 = percentile(totals, 95);
  console.log(
    `  \x1b[1mSilence\x1b[0m   ${silence.timeout} timeouts · ${silence.unpublished} never published · ${silence.error} errors` +
      `  \x1b[2m(counted across all ${subjects.length} runs)\x1b[0m`,
  );

  if (silence.timeout > 0) {
    console.log(
      `\n  \x1b[31m✗ NOT A PASS — ${silence.timeout} node reads exceeded the per-node budget and were\n` +
        `    recorded as non-responders. The broker said so rather than reporting "no exposure",\n` +
        `    which is correct, but a fast empty answer is worth nothing to a lender.\x1b[0m\n` +
        `  \x1b[2mEach node read here costs a Postgres round trip to Ireland. Raise\n` +
        `  INTERCHANGE_NODE_TIMEOUT_MS to see the real answers in this topology; move the Registry\n` +
        `  and its database onto one host to make 400ms a measurement of the design.\x1b[0m\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (silence.unpublished > 0) {
    console.log(
      `  \x1b[2mEvery incomplete answer is a member that has never published a book — a coverage gap,\n` +
        `  not an outage. They are reported rather than silently skipped, because absence of a\n` +
        `  filter is not evidence of absence of exposure.\x1b[0m`,
    );
  }

  console.log(
    p95 <= 400
      ? `\n  \x1b[32m✓ p95 ${p95}ms, no member timed out, ${found}/${subjects.length} answered with exposure\x1b[0m\n`
      : `\n  \x1b[33m! p95 ${p95}ms — outside the 400ms budget, though no member timed out.\x1b[0m\n` +
          `  \x1b[2mScreening is local and measured above; the rest is the Registry's Postgres round\n` +
          `  trip. Moving the Registry and its database onto one host on the tailnet is what makes\n` +
          `  this number a measurement of the design.\x1b[0m\n`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
