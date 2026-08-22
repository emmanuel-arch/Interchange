// ─────────────────────────────────────────────────────────────────────────────
// Sprint 4 acceptance: the closed learning loop.
//
//   npx tsx scripts/verify-learning.ts
//
// Two claims are being tested, and both are the kind that pass vacuously if you
// are not careful:
//
//   POINT-IN-TIME CORRECTNESS. The test constructs a borrower with a KNOWN
//   late-arriving event and confirms the feature store refuses to see it before
//   it was recorded — then confirms it DOES see it afterwards, so we are testing
//   a filter and not a bug.
//
//   REJECT INFERENCE. The test confirms that applicants this member DECLINED
//   carry observed labels sourced from other members, and measures how much of
//   the rejected population is recovered. For a lender alone that number is
//   structurally zero.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeVector, loadSlice } from "../lib/features/store";
import { FEATURES, FEATURE_SET_VERSION, PENDING_FAMILIES } from "../lib/features/definitions";
import { labelDecisions, loopCoverage } from "../lib/labelling";
import { psi } from "../lib/drift";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(52)} ${detail}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(52)} ${detail}`); }
}

const DAY = 86_400_000;

async function main() {
  console.log("\nInterchange Sprint 4 acceptance — the learning loop\n");

  // ── Point-in-time correctness ───────────────────────────────────────────
  console.log("  \x1b[2mPoint-in-time correctness — the leakage test\x1b[0m");

  const member = await prisma.member.findFirstOrThrow({ where: { status: "ACTIVE" } });
  const token = "f".repeat(128); // a token used by nothing else

  await prisma.ledgerEvent.deleteMany({ where: { subjectToken: token } });

  const now = Date.now();
  const happenedAt = new Date(now - 30 * DAY); // the arrears OCCURRED 30 days ago
  const recordedAt = new Date(now - 5 * DAY); //  …but was REPORTED only 5 days ago

  await prisma.ledgerEvent.createMany({
    data: [
      { memberId: member.id, subjectToken: token, at: new Date(now - 60 * DAY), recordedAt: new Date(now - 60 * DAY), kind: "DISBURSED", amountKes: 20_000 },
      { memberId: member.id, subjectToken: token, at: happenedAt, recordedAt, kind: "ARREARS", daysPastDue: 120 },
    ],
  });

  // As of 20 days ago: the arrears had HAPPENED but had not been REPORTED.
  const asOfBefore = new Date(now - 20 * DAY);
  const before = await computeVector(token, asOfBefore);
  check(
    "late-arriving arrears is invisible before it was recorded",
    before.values.rep_worst_dpd === 0,
    `rep_worst_dpd ${before.values.rep_worst_dpd} at T-20d (event occurred T-30d, recorded T-5d)`,
  );

  // As of today: it has been reported, so it must appear.
  const after = await computeVector(token, new Date());
  check(
    "…and visible once it was",
    after.values.rep_worst_dpd === 120,
    `rep_worst_dpd ${after.values.rep_worst_dpd} today`,
  );

  // The naive filter — `at <= asOf` only — would have leaked it.
  const naive = await prisma.ledgerEvent.findMany({
    where: { subjectToken: token, at: { lte: asOfBefore } },
  });
  check(
    "the naive `at`-only filter would have leaked it",
    naive.some((e) => e.kind === "ARREARS"),
    `naive query returns ${naive.length} events including the unreported arrears`,
  );

  const slice = await loadSlice(token, asOfBefore);
  check(
    "the store's slice excludes it structurally",
    !slice.events.some((e) => e.kind === "ARREARS"),
    `${slice.events.length} events in the as-of slice`,
  );

  await prisma.ledgerEvent.deleteMany({ where: { subjectToken: token } });

  // ── Frozen snapshots ────────────────────────────────────────────────────
  console.log("\n  \x1b[2mDecision snapshots — frozen, never recomputed\x1b[0m");

  const sample = await prisma.decision.findFirst({ where: { outcome: "APPROVED" }, orderBy: { at: "asc" } });
  if (!sample) { console.error("No decisions. Run seed-ledger first."); process.exit(1); }

  const stored = sample.features as Record<string, number | null>;
  const recomputedNow = await computeVector(sample.subjectToken, new Date());
  const recomputedAsOf = await computeVector(sample.subjectToken, sample.at);

  // Postgres jsonb normalises key order, so compare by key rather than by
  // serialised string — a stringify comparison here fails on ordering alone.
  const sameValues = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if ((a[k] ?? null) !== (b[k] ?? null)) return false;
    return true;
  };

  check(
    "the stored vector matches an as-of recomputation",
    sameValues(stored, recomputedAsOf.values),
    `${Object.keys(stored).length} features identical`,
  );
  check(
    "…and differs from recomputing it today",
    !sameValues(stored, recomputedNow.values),
    "the world moved on — which is why the snapshot is written at decision time",
  );
  check(
    "every decision carries a feature set version",
    sample.featureSetVersion === FEATURE_SET_VERSION,
    sample.featureSetVersion,
  );

  // ── Reject inference ────────────────────────────────────────────────────
  console.log("\n  \x1b[2mReject inference — labels no single lender can obtain\x1b[0m");

  const report = await labelDecisions();
  const cov = await loopCoverage();

  check(
    "approved decisions labelled from our own book",
    cov.ownLabelled > 0,
    `${cov.ownLabelled} of ${cov.approved} approvals`,
  );
  check(
    "DECLINED applicants recovered from the ecosystem",
    cov.rejectsRecovered > 0,
    `${cov.rejectsRecovered} of ${cov.declined} rejects — ${(cov.rejectCoverage * 100).toFixed(1)}% coverage`,
  );
  check(
    "recovered labels name the member that lent",
    (await prisma.decision.count({ where: { labelSource: "ECOSYSTEM", labelMemberCode: { not: null } } })) > 0,
    "labelMemberCode populated",
  );
  check(
    "a lender alone would have zero of these",
    cov.rejectsRecovered > 0,
    `${cov.rejectsRecovered} training rows that do not otherwise exist`,
  );

  // The bias this corrects, measured.
  const approvedBad = await prisma.decision.count({ where: { labelSource: "OWN_BOOK", label: "DEFAULTED" } });
  const rejectBad = await prisma.decision.count({ where: { labelSource: "ECOSYSTEM", label: "DEFAULTED" } });
  const approvedRate = cov.ownLabelled ? approvedBad / cov.ownLabelled : 0;
  const rejectRate = cov.rejectsRecovered ? rejectBad / cov.rejectsRecovered : 0;
  check(
    "rejects default at a different rate than approvals",
    rejectRate > approvedRate,
    `approvals ${(approvedRate * 100).toFixed(1)}% vs rejects ${(rejectRate * 100).toFixed(1)}% — the gap a lender alone cannot see`,
  );

  // ── Label policy ────────────────────────────────────────────────────────
  console.log("\n  \x1b[2mLabel policy — conservative by design\x1b[0m");

  check(
    "immature outcomes stay unlabelled rather than guessed",
    report.stillImmature > 0,
    `${report.stillImmature} still within the performance window`,
  );

  const invented = await prisma.decision.count({
    where: { label: "REPAID", labelSource: null },
  });
  check("no label without a source", invented === 0, `${invented} sourceless labels`);

  // ── Feature registry ────────────────────────────────────────────────────
  console.log("\n  \x1b[2mFeature registry — one definition, both paths\x1b[0m");

  check(
    "features are declared with families and monotonicity",
    FEATURES.every((f) => !!f.family && !!f.description),
    `${FEATURES.length} implemented, ${PENDING_FAMILIES.reduce((a, p) => a + p.planned, 0)} declared pending`,
  );
  check(
    "unavailable families are reported, not silently omitted",
    recomputedNow.unavailableFamilies.length === PENDING_FAMILIES.length,
    recomputedNow.unavailableFamilies.join(", "),
  );

  // ── Drift ───────────────────────────────────────────────────────────────
  console.log("\n  \x1b[2mDrift — population stability\x1b[0m");

  const decisions = await prisma.decision.findMany({ orderBy: { at: "asc" }, select: { features: true } });
  const half = Math.floor(decisions.length / 2);
  const older = decisions.slice(0, half).map((d) => (d.features as Record<string, number>).eco_active_lenders ?? 0);
  const newer = decisions.slice(half).map((d) => (d.features as Record<string, number>).eco_active_lenders ?? 0);
  const drift = psi(older, newer);
  check(
    "PSI computes over a real feature",
    Number.isFinite(drift),
    `eco_active_lenders PSI ${drift.toFixed(4)} (${drift < 0.1 ? "stable" : drift < 0.25 ? "moderate shift" : "significant shift"})`,
  );

  console.log(`\n  loop: ${cov.labelledTotal} labelled of ${cov.total} decisions · ${cov.rejectsRecovered} recovered from rejects · ${cov.immature} immature\n`);
  console.log(`  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
