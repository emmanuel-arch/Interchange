// ─────────────────────────────────────────────────────────────────────────────
// THE METER — every bureau reading, priced, attributed and kept by the month.
//
// Founder, 24 Oct 2026: every CRB call to Metropol passes through the
// Interchange, so the Interchange is where each lender's spend is counted — by
// organisation, by channel (Lending Console, Interchange, a system), and by the
// person or process that asked. "Make sure no reading goes through without
// being metered and billed." The month is cumulative and locks when it ends;
// the 1st starts a fresh one.
//
// HOW "NO READING WITHOUT A METER ROW" IS MADE TRUE, NOT HOPED:
//   · openMeter() runs after the gate grants and BEFORE the bureau is asked, and
//     the caller awaits it. If the row cannot be written, the pull does not
//     happen — the caller turns the failure into a refusal.
//   · The open row is PENDING and priced AS BILLED. A process that dies between
//     the bureau answering and settleMeter() leaves a charge on the meter, not a
//     free reading.
//   · settleMeter() then records what really happened: billed, re-served from
//     the store (no new charge), or not billed (refusal, outage, replay).
//
// PRICES are the contract holder's rate card (lib/codes/metropol-rate-card.ts)
// for the bureau reports that actually answered, plus the Interchange's stated
// fee for the report type — net, before excise and VAT, exactly as the report
// catalogue quotes them to a member before they ask.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import type { MeterChannel, MeterState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cardCost } from "@/lib/codes/metropol-rate-card";
import type { InterchangeReport } from "@/lib/reports/catalogue";

/** Who asked for a reading, as the channel that carried it reports them. */
export type MeterActor = {
  kind: "operator" | "staff" | "system";
  name: string | null;
  email: string | null;
  ref: string | null;
  surface: string | null;
};

/** Nairobi has no daylight saving: EAT is UTC+3 all year. */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The billing month a moment falls in, in Nairobi time — "2026-10". */
export function periodOf(at: Date = new Date()): string {
  return new Date(at.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 7);
}

/** "2026-10" → "October 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The last instant of a period, as the bill's "closes" line prints it. */
export function periodCloses(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1) - EAT_OFFSET_MS - 1);
}

const CHANNELS: MeterChannel[] = ["LENDING_CONSOLE", "INTERCHANGE", "SYSTEM"];

/**
 * The channel a SIGNED member call claims. A member's node says which of its own
 * surfaces asked; anything it does not name is a system, never a person.
 */
export function channelFrom(raw: unknown): MeterChannel {
  const s = String(raw ?? "").toUpperCase();
  return (CHANNELS as string[]).includes(s) && s !== "INTERCHANGE" ? (s as MeterChannel) : "SYSTEM";
}

/**
 * The requester a SIGNED member call names in `requested_by`. It is the member's
 * own assertion about its own staff — signed with the member's key, so it is
 * attributable to the member, and it is recorded as given.
 */
export function actorFrom(raw: unknown, channel: MeterChannel): MeterActor {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const name = str(r.name);
  return {
    kind: channel === "LENDING_CONSOLE" && name ? "staff" : "system",
    name: name ?? (channel === "SYSTEM" ? str(r.system) ?? "System" : null),
    email: str(r.email)?.toLowerCase() ?? null,
    ref: str(r.id ?? r.user_id, 64),
    surface: str(r.surface ?? r.channel_surface, 64),
  };
}

/** What the reading costs when billed: the answered reports on the card, plus our fee. */
export function priceOf(def: Pick<InterchangeReport, "interchangeFee" | "bureauReports">, answered: number[]) {
  const bureauKes = Math.round(cardCost(answered).net);
  const feeKes = Math.round(def.interchangeFee);
  return { bureauKes, feeKes, totalKes: bureauKes + feeKes };
}

/**
 * Open the meter row. Awaited by the caller, BEFORE the bureau is asked. Throws
 * if it cannot be written — and the caller refuses the reading.
 */
export async function openMeter(args: {
  member: { id: string; code: string };
  def: Pick<InterchangeReport, "type" | "name" | "interchangeFee" | "bureauReports">;
  channel: MeterChannel;
  actor: MeterActor;
  subjectToken: string;
  consentRef: string | null;
}): Promise<string> {
  // A month that ended since the last reading is closed before this one opens,
  // so a statement is never written while its month is still taking rows.
  await lockClosedPeriods().catch((e) => console.error("[meter] lock failed:", e));
  const price = priceOf(args.def, args.def.bureauReports);
  const row = await prisma.usageMeter.create({
    data: {
      period: periodOf(),
      memberId: args.member.id,
      memberCode: args.member.code,
      reportType: args.def.type,
      reportName: args.def.name,
      bureauReports: args.def.bureauReports,
      channel: args.channel,
      actorKind: args.actor.kind,
      actorName: args.actor.name,
      actorEmail: args.actor.email,
      actorRef: args.actor.ref,
      surface: args.actor.surface,
      state: "PENDING",
      billedPulls: args.def.bureauReports.length,
      ...price,
      subjectToken: args.subjectToken,
      consentRef: args.consentRef,
    },
    select: { id: true },
  });
  return row.id;
}

/** Record what really happened. Never throws — a bookkeeping fault must not cost a member a report. */
export async function settleMeter(
  id: string,
  outcome: {
    state: Exclude<MeterState, "PENDING">;
    def: Pick<InterchangeReport, "interchangeFee" | "bureauReports">;
    servedFrom: "bureau" | "store" | "replay" | null;
    billedPulls: number;
    /** The bureau report numbers that answered — what the bill is for. */
    answered: number[];
    logSeq?: bigint | null;
    pullId?: string | null;
    detail?: string | null;
  },
): Promise<void> {
  const price =
    outcome.state === "BILLED" ? priceOf(outcome.def, outcome.answered) : { bureauKes: 0, feeKes: 0, totalKes: 0 };
  await prisma.usageMeter
    .update({
      where: { id },
      data: {
        state: outcome.state,
        servedFrom: outcome.servedFrom,
        billedPulls: outcome.state === "BILLED" ? outcome.billedPulls : 0,
        ...price,
        logSeq: outcome.logSeq ?? null,
        pullId: outcome.pullId ?? null,
        detail: outcome.detail?.slice(0, 500) ?? null,
        settledAt: new Date(),
      },
    })
    .catch((e) => console.error(`[meter] could not settle ${id}:`, e));
}

/** A row counts toward the bill while PENDING (priced as billed) or once BILLED. */
export const CHARGEABLE: MeterState[] = ["PENDING", "BILLED"];

/**
 * Close every month that has ended and has no statement yet. Idempotent — the
 * statement is unique per (member, period), so two callers racing to close the
 * same month leave one statement.
 */
export async function lockClosedPeriods(now: Date = new Date()): Promise<number> {
  const current = periodOf(now);
  const open = await prisma.usageMeter.groupBy({
    by: ["memberId", "memberCode", "period"],
    where: { period: { lt: current } },
  });
  if (open.length === 0) return 0;
  const locked = await prisma.usageStatement.findMany({
    where: { OR: open.map((o) => ({ memberId: o.memberId, period: o.period })) },
    select: { memberId: true, period: true },
  });
  const done = new Set(locked.map((l) => `${l.memberId}|${l.period}`));
  let made = 0;
  for (const o of open) {
    if (done.has(`${o.memberId}|${o.period}`)) continue;
    const rows = await prisma.usageMeter.findMany({
      where: { memberId: o.memberId, period: o.period },
      orderBy: { at: "asc" },
      select: { id: true, channel: true, state: true, billedPulls: true, totalKes: true },
    });
    const chargeable = rows.filter((r) => CHARGEABLE.includes(r.state));
    const byChannel: Record<string, { readings: number; totalKes: number }> = {};
    for (const r of rows) {
      const c = (byChannel[r.channel] ??= { readings: 0, totalKes: 0 });
      c.readings++;
      if (CHARGEABLE.includes(r.state)) c.totalKes += r.totalKes;
    }
    const digest = createHash("sha256")
      .update(rows.map((r) => `${r.id}:${r.state}:${r.totalKes}`).join("\n"), "utf8")
      .digest("hex");
    await prisma.usageStatement
      .create({
        data: {
          memberId: o.memberId,
          memberCode: o.memberCode,
          period: o.period,
          readings: rows.length,
          billedPulls: chargeable.reduce((s, r) => s + r.billedPulls, 0),
          totalKes: chargeable.reduce((s, r) => s + r.totalKes, 0),
          byChannel,
          digest,
        },
      })
      .then(() => made++)
      .catch(() => undefined); // a concurrent closer won — one statement either way
  }
  return made;
}
