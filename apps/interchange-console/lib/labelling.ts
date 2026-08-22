// ─────────────────────────────────────────────────────────────────────────────
// Outcome labelling — closing the loop.
//
// Written as plain functions rather than Dagster assets so they can run here and
// be wrapped later. The orchestration is not the hard part; the label policy is.
//
// TWO SOURCES OF TRUTH, AND THE SECOND IS THE POINT:
//
//   OWN_BOOK   we approved, we lent, we watched what happened. Every lender has
//              this, and every lender's model is trained on it alone.
//
//   ECOSYSTEM  we DECLINED — and another member approved, and we observed THEIR
//              outcome against the same subject token. This is reject inference
//              with observed ground truth instead of a statistical guess.
//
// Why the second matters more than it sounds: a lender only ever observes the
// applicants it approved. Train on those alone and the model learns to reproduce
// the existing credit policy rather than to predict repayment — the classic
// selection bias, and the reason in-house scorecards plateau and then quietly
// decay. The standard remedies (parcelling, augmentation, bureau proxies) are
// all attempts to GUESS what would have happened to the rejected.
//
// Inside the ecosystem there is no need to guess. No single lender can do this,
// and no bureau can sell it.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";

/** Days after disbursement before an outcome is considered settled. */
export const PERFORMANCE_WINDOW_DAYS = 90;

/** Days past due at which a loan is called defaulted. Matches CollectBox NPL. */
export const DEFAULT_DPD = 90;

export type LabelReport = {
  considered: number;
  labelledOwnBook: number;
  labelledEcosystem: number;
  stillImmature: number;
  byLabel: Record<string, number>;
};

type Verdict = { label: "REPAID" | "DEFAULTED" | "IMMATURE"; memberCode: string | null };

/**
 * Decide the outcome of one borrower's exposure with one member, as of now.
 *
 * Deliberately conservative: a loan is DEFAULTED only on observed arrears at or
 * beyond the threshold, REPAID only on an observed closure, and IMMATURE
 * otherwise. An unlabelled row is far less damaging than a wrongly labelled one
 * — a wrong label is indistinguishable from signal and will be learned.
 */
function verdictFor(
  events: { at: Date; kind: string; daysPastDue: number | null }[],
  since: Date,
): "REPAID" | "DEFAULTED" | "IMMATURE" {
  const after = events.filter((e) => e.at >= since);
  const worstDpd = Math.max(0, ...after.filter((e) => e.kind === "ARREARS").map((e) => e.daysPastDue ?? 0));

  if (worstDpd >= DEFAULT_DPD) return "DEFAULTED";
  if (after.some((e) => e.kind === "CLOSED")) return "REPAID";

  const matured = Date.now() - since.getTime() >= PERFORMANCE_WINDOW_DAYS * 86_400_000;
  // Matured with no closure and no serious arrears still means we never saw it
  // end. Calling that REPAID would invent a good outcome from silence.
  return matured && after.some((e) => e.kind === "REPAYMENT") ? "REPAID" : "IMMATURE";
}

export async function labelDecisions(): Promise<LabelReport> {
  const pending = await prisma.decision.findMany({
    where: { OR: [{ label: null }, { label: "IMMATURE" }] },
    orderBy: { at: "asc" },
  });

  const report: LabelReport = {
    considered: pending.length,
    labelledOwnBook: 0,
    labelledEcosystem: 0,
    stillImmature: 0,
    byLabel: {},
  };

  const memberCodes = new Map(
    (await prisma.member.findMany({ select: { id: true, code: true } })).map((m) => [m.id, m.code]),
  );

  // One query for every subject, not one per decision. The per-decision version
  // was 300 sequential round trips and dropped the connection outright — a job
  // that falls over partway through is worse than a slow one, because it leaves
  // the labels half-applied with no record of where it stopped.
  const tokens = [...new Set(pending.map((d) => d.subjectToken))];
  const allEvents = await prisma.ledgerEvent.findMany({
    where: { subjectToken: { in: tokens } },
    orderBy: { at: "asc" },
    select: { subjectToken: true, memberId: true, at: true, kind: true, daysPastDue: true },
  });

  const eventsByToken = new Map<string, typeof allEvents>();
  for (const e of allEvents) {
    const arr = eventsByToken.get(e.subjectToken);
    if (arr) arr.push(e);
    else eventsByToken.set(e.subjectToken, [e]);
  }

  const updates: { id: string; label: string; source: string | null; memberCode: string | null }[] = [];

  for (const d of pending) {
    // Only events at or after the decision can inform its outcome. This is the
    // same discipline as the feature store, pointed the other way.
    const events = (eventsByToken.get(d.subjectToken) ?? []).filter((e) => e.at >= d.at);

    let verdict: Verdict;

    if (d.outcome === "APPROVED") {
      // Our own book: only this member's events count.
      const mine = events.filter((e) => e.memberId === d.memberId);
      verdict = { label: verdictFor(mine, d.at), memberCode: null };
      if (verdict.label !== "IMMATURE") report.labelledOwnBook++;
    } else {
      // ── Reject inference ──────────────────────────────────────────────────
      // We declined. Did anyone else lend? If so, their outcome is ours to
      // learn from — observed, not imputed.
      const others = events.filter((e) => e.memberId !== d.memberId);
      const lender = others.find((e) => e.kind === "DISBURSED");

      if (!lender) {
        verdict = { label: "IMMATURE", memberCode: null };
      } else {
        const theirs = others.filter((e) => e.memberId === lender.memberId);
        const label = verdictFor(theirs, lender.at);
        verdict = { label, memberCode: memberCodes.get(lender.memberId) ?? null };
        if (label !== "IMMATURE") report.labelledEcosystem++;
      }
    }

    if (verdict.label === "IMMATURE") report.stillImmature++;
    report.byLabel[verdict.label] = (report.byLabel[verdict.label] ?? 0) + 1;

    updates.push({
      id: d.id,
      label: verdict.label,
      source:
        verdict.label === "IMMATURE" ? null : d.outcome === "APPROVED" ? "OWN_BOOK" : "ECOSYSTEM",
      memberCode: verdict.memberCode,
    });
  }

  // Group by the value being written, then one updateMany per group. There are
  // only a few distinct (label, source, member) combinations however many
  // decisions there are, so this is a handful of statements rather than one per
  // row — and it stays sequential, because a burst of concurrent writes is what
  // dropped the connection in the first place.
  const groups = new Map<string, { label: string; source: string | null; memberCode: string | null; ids: string[] }>();
  for (const u of updates) {
    const key = `${u.label}|${u.source ?? ""}|${u.memberCode ?? ""}`;
    const g = groups.get(key);
    if (g) g.ids.push(u.id);
    else groups.set(key, { label: u.label, source: u.source, memberCode: u.memberCode, ids: [u.id] });
  }

  const labelledAt = new Date();
  for (const g of groups.values()) {
    // Chunk the id list so the parameter count stays sane on large batches.
    for (let i = 0; i < g.ids.length; i += 500) {
      await prisma.decision.updateMany({
        where: { id: { in: g.ids.slice(i, i + 500) } },
        data: {
          label: g.label,
          labelledAt,
          labelSource: g.source,
          labelMemberCode: g.memberCode,
        },
      });
    }
  }

  return report;
}

/**
 * What the loop actually recovered.
 *
 * The number to watch is `rejectsRecovered`: declined applicants who now carry
 * an observed label. For a lender operating alone that number is structurally
 * zero, forever.
 */
export async function loopCoverage() {
  // Sequential rather than Promise.all. This is a reporting call on a batch
  // path where nothing is waiting on it, and the local PGlite development
  // database serialises connections anyway — fanning out buys no wall-clock
  // time here and costs reliability.
  const total = await prisma.decision.count();
  const approved = await prisma.decision.count({ where: { outcome: "APPROVED" } });
  const declined = await prisma.decision.count({ where: { outcome: "DECLINED" } });
  const ownLabelled = await prisma.decision.count({ where: { labelSource: "OWN_BOOK" } });
  const ecoLabelled = await prisma.decision.count({ where: { labelSource: "ECOSYSTEM" } });
  const immature = await prisma.decision.count({ where: { label: "IMMATURE" } });

  return {
    total,
    approved,
    declined,
    ownLabelled,
    rejectsRecovered: ecoLabelled,
    immature,
    // Share of the DECLINED population that a lender alone could never label.
    rejectCoverage: declined === 0 ? 0 : ecoLabelled / declined,
    labelledTotal: ownLabelled + ecoLabelled,
  };
}
