// ─────────────────────────────────────────────────────────────────────────────
// Seed the bitemporal ledger and a population of credit decisions.
//
//   npx tsx scripts/seed-ledger.ts
//
// Two things this fixture deliberately contains, because without them the tests
// that matter would pass vacuously:
//
//   1. LATE-ARRIVING EVENTS. Some arrears are recorded days or weeks after they
//      occurred. If the feature store filtered on `at` instead of `recordedAt`,
//      these would leak into earlier vectors — and the leakage test would have
//      nothing to catch.
//
//   2. DECLINED APPLICANTS WHO BORROWED ELSEWHERE. Without these, reject
//      inference has nothing to recover and its coverage number is meaningless.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { canonicalIdentifier } from "../lib/oprf/node";
import { evaluateDirect } from "../lib/oprf/registry";
import { computeFrom } from "../lib/features/store";
import { FEATURE_SET_VERSION } from "../lib/features/definitions";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let seed = 20260822;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const between = (lo: number, hi: number) => Math.floor(lo + rnd() * (hi - lo));
const DAY = 86_400_000;

type Ev = {
  memberId: string;
  subjectToken: string;
  at: Date;
  recordedAt: Date;
  kind: string;
  amountKes: number | null;
  daysPastDue: number | null;
};

async function main() {
  const members = await prisma.member.findMany({
    where: { status: { in: ["ACTIVE", "SHADOW"] } },
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  if (members.length < 3) {
    console.error("Need members. Run db:seed first.");
    process.exit(1);
  }

  await prisma.decision.deleteMany();
  await prisma.ledgerEvent.deleteMany();

  const now = Date.now();
  const events: Ev[] = [];
  let lateArrivals = 0;

  const tokenFor = (id: string) =>
    evaluateDirect(
      process.env.INTERCHANGE_OPRF_KEY!,
      new TextEncoder().encode(canonicalIdentifier("national_id", id)),
    );

  type Pending = { token: string; memberId: string; at: Date; outcome: "APPROVED" | "DECLINED" };
  const pendingDecisions: Pending[] = [];

  for (let i = 0; i < 1400; i++) {
    const token = tokenFor(String(40_000_000 + i * 13));

    // ── Latent risk ────────────────────────────────────────────────────────
    // Each borrower has an unobserved riskiness that drives THREE things: how
    // much prior stacking and arrears they accumulate, whether the existing
    // credit policy approves them, and whether they ultimately default.
    //
    // This is the confounding structure real lending has, and the fixture needs
    // it or the whole exercise is circular. An earlier version drew defaults
    // from a bare rnd(), which meant the decision-time features carried no
    // information about the outcome — the model correctly found nothing
    // (AUC 0.48), and the reject-inference gap was hardcoded rather than
    // emergent. Signal has to be IN the data-generating process for a test of
    // whether the pipeline finds signal to mean anything.
    const latentRisk = rnd(); // 0 = safest, 1 = riskiest

    // Everyone applies somewhere between 30 and 400 days ago.
    const firstAppDaysAgo = between(30, 400);
    const applyAt = new Date(now - firstAppDaysAgo * DAY);
    const primary = members[between(0, members.length)];

    // ── Prior history ──────────────────────────────────────────────────────
    // 45% of applicants are not new to the ecosystem: they already hold or have
    // held credit elsewhere when they apply. Without this the decision vectors
    // are all zeros — every feature would be degenerate, PSI would be
    // meaningless, and the fixture would prove nothing about a store whose whole
    // job is summarising prior history.
    if (rnd() < 0.30 + 0.45 * latentRisk) {
      // Riskier borrowers stack with more lenders before they get here.
      const priorLenders = 1 + Math.floor(latentRisk * 3.5);
      for (let p = 0; p < priorLenders; p++) {
        const lender = members[between(0, members.length)];
        // Strictly BEFORE the application, so it is legitimately knowable.
        const priorAt = new Date(applyAt.getTime() - between(20, 300) * DAY);
        const priorAmt = between(3_000, 40_000);
        events.push({
          memberId: lender.id, subjectToken: token, at: priorAt, recordedAt: priorAt,
          kind: "APPLICATION", amountKes: null, daysPastDue: null,
        });
        events.push({
          memberId: lender.id, subjectToken: token, at: new Date(priorAt.getTime() + DAY),
          recordedAt: new Date(priorAt.getTime() + DAY),
          kind: "DISBURSED", amountKes: priorAmt, daysPastDue: null,
        });
        // Some prior loans went bad, some closed cleanly.
        if (rnd() < 0.10 + 0.55 * latentRisk) {
          const badAt = new Date(priorAt.getTime() + between(25, 80) * DAY);
          const lag = rnd() < 0.5 ? between(3, 30) : 0;
          if (lag > 0) lateArrivals++;
          events.push({
            memberId: lender.id, subjectToken: token, at: badAt,
            recordedAt: new Date(badAt.getTime() + lag * DAY),
            kind: "ARREARS", amountKes: null, daysPastDue: between(20, 150),
          });
        } else {
          const closeAt = new Date(priorAt.getTime() + between(60, 140) * DAY);
          events.push({
            memberId: lender.id, subjectToken: token, at: new Date(closeAt.getTime() - 15 * DAY),
            recordedAt: new Date(closeAt.getTime() - 15 * DAY),
            kind: "REPAYMENT", amountKes: priorAmt, daysPastDue: null,
          });
          events.push({
            memberId: lender.id, subjectToken: token, at: closeAt, recordedAt: closeAt,
            kind: "CLOSED", amountKes: null, daysPastDue: null,
          });
        }
      }
    }

    events.push({
      memberId: primary.id, subjectToken: token, at: applyAt, recordedAt: applyAt,
      kind: "APPLICATION", amountKes: null, daysPastDue: null,
    });

    // The existing credit policy screens risk IMPERFECTLY — which is exactly
    // why reject inference has anything to recover. A perfect policy would leave
    // no good borrowers among the declined and no signal to find.
    const approved = rnd() < 0.9 - 0.6 * latentRisk;
    pendingDecisions.push({ token, memberId: primary.id, at: applyAt, outcome: approved ? "APPROVED" : "DECLINED" });

    if (approved) {
      const amount = between(5_000, 60_000);
      const disbursedAt = new Date(applyAt.getTime() + DAY);
      events.push({
        memberId: primary.id, subjectToken: token, at: disbursedAt, recordedAt: disbursedAt,
        kind: "DISBURSED", amountKes: amount, daysPastDue: null,
      });

      // Default probability rises with latent risk.
      if (rnd() < 0.05 + 0.45 * latentRisk) {
        const dpd = between(30, 160);
        const arrearsAt = new Date(disbursedAt.getTime() + between(20, 70) * DAY);
        // HALF of all arrears are reported LATE — days to weeks after the fact.
        const lag = rnd() < 0.5 ? between(3, 30) : 0;
        if (lag > 0) lateArrivals++;
        events.push({
          memberId: primary.id, subjectToken: token, at: arrearsAt,
          recordedAt: new Date(arrearsAt.getTime() + lag * DAY),
          kind: "ARREARS", amountKes: null, daysPastDue: dpd,
        });
      } else {
        const n = between(2, 5);
        for (let r = 0; r < n; r++) {
          const at = new Date(disbursedAt.getTime() + (r + 1) * 21 * DAY);
          if (at.getTime() > now) break;
          events.push({
            memberId: primary.id, subjectToken: token, at, recordedAt: at,
            kind: "REPAYMENT", amountKes: Math.floor(amount / n), daysPastDue: null,
          });
        }
        const closedAt = new Date(disbursedAt.getTime() + (n + 1) * 21 * DAY);
        if (closedAt.getTime() <= now) {
          events.push({
            memberId: primary.id, subjectToken: token, at: closedAt, recordedAt: closedAt,
            kind: "CLOSED", amountKes: null, daysPastDue: null,
          });
        }
      }
    } else {
      events.push({
        memberId: primary.id, subjectToken: token, at: new Date(applyAt.getTime() + 3_600_000),
        recordedAt: new Date(applyAt.getTime() + 3_600_000),
        kind: "DECLINE", amountKes: null, daysPastDue: null,
      });

      // ── The reject-inference population ────────────────────────────────
      // 55% of people declined by one member get credit from another. Their
      // outcomes are what a lender operating alone can never observe.
      if (rnd() < 0.55) {
        const other = members.filter((m) => m.id !== primary.id)[between(0, members.length - 1)];
        const otherAt = new Date(applyAt.getTime() + between(1, 20) * DAY);
        if (otherAt.getTime() < now) {
          const amount = between(5_000, 45_000);
          events.push({
            memberId: other.id, subjectToken: token, at: otherAt, recordedAt: otherAt,
            kind: "DISBURSED", amountKes: amount, daysPastDue: null,
          });

          // NOTE: the same risk function as approvals. The higher observed default
          // rate among rejects is not hardcoded — it EMERGES because the policy
          // declined the riskier applicants in the first place. That is what makes
          // the measured gap meaningful rather than assumed.
          if (rnd() < 0.05 + 0.45 * latentRisk) {
            const arrearsAt = new Date(otherAt.getTime() + between(20, 70) * DAY);
            if (arrearsAt.getTime() < now) {
              events.push({
                memberId: other.id, subjectToken: token, at: arrearsAt, recordedAt: arrearsAt,
                kind: "ARREARS", amountKes: null, daysPastDue: between(90, 180),
              });
            }
          } else {
            const closedAt = new Date(otherAt.getTime() + between(60, 120) * DAY);
            if (closedAt.getTime() < now) {
              events.push({
                memberId: other.id, subjectToken: token, at: new Date(closedAt.getTime() - 20 * DAY),
                recordedAt: new Date(closedAt.getTime() - 20 * DAY),
                kind: "REPAYMENT", amountKes: amount, daysPastDue: null,
              });
              events.push({
                memberId: other.id, subjectToken: token, at: closedAt, recordedAt: closedAt,
                kind: "CLOSED", amountKes: null, daysPastDue: null,
              });
            }
          }
        }
      }
    }
  }

  await prisma.ledgerEvent.createMany({ data: events });
  console.log(`ledger events   : ${events.length} (${lateArrivals} recorded late)`);

  // ── Decision snapshots ──────────────────────────────────────────────────
  // Each vector is computed AS OF the decision instant, from what was KNOWN
  // then — exactly what the live scorer would have had.
  const all = await prisma.ledgerEvent.findMany({
    where: { subjectToken: { in: [...new Set(pendingDecisions.map((d) => d.token))] } },
    select: { subjectToken: true, memberId: true, at: true, recordedAt: true, kind: true, amountKes: true, daysPastDue: true },
  });
  const byToken = new Map<string, typeof all>();
  for (const e of all) {
    const arr = byToken.get(e.subjectToken) ?? [];
    arr.push(e);
    byToken.set(e.subjectToken, arr);
  }

  const rows = pendingDecisions.map((d) => {
    const known = (byToken.get(d.token) ?? []).filter(
      (e) => e.recordedAt <= d.at && e.at <= d.at,
    );
    const vector = computeFrom({ subjectToken: d.token, asOf: d.at, events: known });
    return {
      memberId: d.memberId,
      subjectToken: d.token,
      at: d.at,
      outcome: d.outcome,
      amountKes: d.outcome === "APPROVED" ? between(5_000, 60_000) : null,
      features: vector.values as never,
      featureSetVersion: FEATURE_SET_VERSION,
      modelVersion: "baseline-0",
      score: between(300, 850),
    };
  });

  await prisma.decision.createMany({ data: rows });

  const approvedCount = rows.filter((r) => r.outcome === "APPROVED").length;
  console.log(`decisions       : ${rows.length} (${approvedCount} approved, ${rows.length - approvedCount} declined)`);
  console.log(`feature set     : ${FEATURE_SET_VERSION}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
