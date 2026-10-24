// ─────────────────────────────────────────────────────────────────────────────
// /usage — what each lender is spending on the bureau, this month and before.
//
// Every bureau reading in the estate passes through the Interchange and is
// metered there (lib/meter.ts): from the Lending Console, from this console,
// or from a lender's system. This page reads that meter — per organisation, per
// channel, per person — as a running bill. The current month is cumulative and
// stays open until midnight on its last day in Nairobi; then it locks into a
// statement and the 1st starts afresh.
//
// A lender's own operators see their own organisation; a platform operator sees
// every one.
// ─────────────────────────────────────────────────────────────────────────────
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { PageHeader, Panel, Empty, Pill } from "@/components/chrome";
import { prisma } from "@/lib/prisma";
import { readSession, SESSION_COOKIE } from "@/lib/session";
import { lenderDoorForMember } from "@/lib/lenders";
import { CHARGEABLE, lockClosedPeriods, periodCloses, periodLabel, periodOf } from "@/lib/meter";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Usage & billing" };

const CHANNEL: Record<string, string> = { LENDING_CONSOLE: "Lending Console", INTERCHANGE: "Interchange", SYSTEM: "System" };
const STATE: Record<string, { label: string; tone: "ok" | "pending" | "bad" | "mute" }> = {
  BILLED: { label: "Billed", tone: "ok" },
  PENDING: { label: "Unsettled · billed", tone: "pending" },
  RESERVED: { label: "Re-served · free", tone: "mute" },
  NOT_BILLED: { label: "Not billed", tone: "mute" },
};

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const when = (d: Date) =>
  d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

export default async function UsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const sp = await searchParams;
  await lockClosedPeriods().catch((e) => console.error("[usage] lock failed:", e));

  // A lender sees all of its own books (Axe: Boresha and Stawi); the platform sees all.
  const scope = session?.member ? lenderDoorForMember(session.member)?.members ?? [session.member] : null;
  const where = scope ? { memberCode: { in: scope } } : {};

  const current = periodOf();
  const periods = [
    ...new Set([
      current,
      ...(await prisma.usageMeter.findMany({ where, distinct: ["period"], select: { period: true } })).map((p) => p.period),
    ]),
  ].sort().reverse();
  const period = typeof sp.period === "string" && periods.includes(sp.period) ? sp.period : current;
  const open = period === current;

  const [rows, statements] = await Promise.all([
    prisma.usageMeter.findMany({ where: { ...where, period }, orderBy: { at: "desc" }, take: 500 }),
    prisma.usageStatement.findMany({ where: { ...where, period } }),
  ]);

  // ── By organisation ─────────────────────────────────────────────────────
  type Org = { name: string; codes: Set<string>; readings: number; billed: number; total: number; byChannel: Map<string, { readings: number; total: number }>; byPerson: Map<string, { who: string; channel: string; readings: number; total: number }> };
  const orgs = new Map<string, Org>();
  for (const r of rows) {
    const door = lenderDoorForMember(r.memberCode);
    const key = door?.slug ?? r.memberCode;
    const o = orgs.get(key) ?? { name: door?.name ?? r.memberCode, codes: new Set(), readings: 0, billed: 0, total: 0, byChannel: new Map(), byPerson: new Map() };
    const charge = CHARGEABLE.includes(r.state) ? r.totalKes : 0;
    o.codes.add(r.memberCode);
    o.readings++;
    if (CHARGEABLE.includes(r.state)) o.billed += r.billedPulls;
    o.total += charge;
    const c = o.byChannel.get(r.channel) ?? { readings: 0, total: 0 };
    c.readings++;
    c.total += charge;
    o.byChannel.set(r.channel, c);
    const who = r.actorName ?? (r.actorKind === "system" ? "System" : "Not recorded");
    const pk = `${r.channel}|${who}`;
    const p = o.byPerson.get(pk) ?? { who: `${who}${r.actorEmail ? ` · ${r.actorEmail}` : ""}`, channel: r.channel, readings: 0, total: 0 };
    p.readings++;
    p.total += charge;
    o.byPerson.set(pk, p);
    orgs.set(key, o);
  }
  const grand = [...orgs.values()].reduce((s, o) => s + o.total, 0);

  return (
    <>
      <PageHeader
        eyebrow="Metering · every bureau reading"
        title="Usage & Billing"
        lede="Every CRB pull in the estate passes through the Interchange and is metered here — by organisation, by channel and by person. The month is cumulative, locks when it ends, and the 1st starts afresh."
        right={
          <div className="text-right">
            <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400">{kes(grand)}</div>
            <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/45">{periodLabel(period)} · {open ? "to date" : "locked"}</div>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {periods.map((p) => (
          <Link
            key={p}
            href={`/usage?period=${p}`}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium ${p === period ? "border-transparent text-[#fff]" : "border-white/[0.12] text-white/65 hover:bg-white/[0.04]"}`}
            style={p === period ? { backgroundColor: "var(--accent)" } : undefined}
          >
            {periodLabel(p)}
            {p === current ? " · open" : ""}
          </Link>
        ))}
        <span className="ml-auto text-[12px] text-white/55">
          {open
            ? `Open — cumulative to date. Locks ${periodCloses(period).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })} EAT.`
            : statements.length
              ? `Locked ${statements[0].lockedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" })} · statement digest ${statements[0].digest.slice(0, 12)}…`
              : "Closed."}
        </span>
      </div>

      {orgs.size === 0 ? (
        <Panel title={periodLabel(period)}>
          <Empty>No bureau readings this month</Empty>
        </Panel>
      ) : (
        <div className="space-y-6">
          {[...orgs.values()].map((o) => (
            <Panel key={o.name} title={`${o.name} · ${[...o.codes].join(", ")}`} hint={`${o.readings} reading${o.readings === 1 ? "" : "s"}`}>
              <div className="grid grid-cols-2 gap-px border-b border-white/[0.06] bg-white/[0.06] md:grid-cols-4">
                {[
                  { v: kes(o.total), l: open ? "Bill to date" : "Month's bill" },
                  { v: String(o.billed), l: "Billed bureau pulls" },
                  { v: String(o.readings), l: "Readings metered" },
                  { v: o.readings ? kes(o.total / Math.max(1, [...o.byChannel.values()].reduce((s, c) => s + c.readings, 0))) : "—", l: "Average per reading" },
                ].map((s) => (
                  <div key={s.l} className="bg-[color:var(--tile)] px-4 py-4">
                    <div className="mb-1.5 font-mono text-xl font-bold tabular-nums text-emerald-400">{s.v}</div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/50">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="grid gap-6 px-5 py-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">By channel</p>
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {[...o.byChannel.entries()].map(([ch, c]) => (
                        <tr key={ch} className="border-t border-white/[0.05]">
                          <td className="py-1.5 text-white/80">{CHANNEL[ch] ?? ch}</td>
                          <td className="py-1.5 text-right tabular-nums text-white/60">{c.readings}</td>
                          <td className="py-1.5 text-right tabular-nums text-white/85">{kes(c.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">By person or system</p>
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {[...o.byPerson.values()].map((p) => (
                        <tr key={p.channel + p.who} className="border-t border-white/[0.05]">
                          <td className="py-1.5 text-white/80">
                            {p.who}
                            <span className="ml-1.5 text-[11px] text-white/45">{CHANNEL[p.channel] ?? p.channel}</span>
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-white/60">{p.readings}</td>
                          <td className="py-1.5 text-right tabular-nums text-white/85">{kes(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Panel>
          ))}

          <Panel title="Every reading" hint="newest first · prices net of excise and VAT">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/45">
                    <th className="px-5 py-2.5 text-left font-normal">When (EAT)</th>
                    <th className="py-2.5 text-left font-normal">Organisation</th>
                    <th className="py-2.5 text-left font-normal">Channel</th>
                    <th className="py-2.5 text-left font-normal">Who</th>
                    <th className="py-2.5 text-left font-normal">Report</th>
                    <th className="py-2.5 text-left font-normal">State</th>
                    <th className="px-5 py-2.5 text-right font-normal">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = STATE[r.state] ?? { label: r.state, tone: "mute" as const };
                    return (
                      <tr key={r.id} className="border-t border-white/[0.05] align-top">
                        <td className="whitespace-nowrap px-5 py-2 font-mono text-white/70">{when(r.at)}</td>
                        <td className="py-2 text-white/80">
                          {lenderDoorForMember(r.memberCode)?.name ?? r.memberCode}
                          <span className="block font-mono text-[10px] text-white/40">{r.memberCode}</span>
                        </td>
                        <td className="py-2 text-white/75">
                          {CHANNEL[r.channel] ?? r.channel}
                          {r.surface && <span className="block text-[10.5px] text-white/40">{r.surface}</span>}
                        </td>
                        <td className="py-2 text-white/80">
                          {r.actorName ?? (r.actorKind === "system" ? "System" : "Not recorded")}
                          {r.actorEmail && <span className="block text-[10.5px] text-white/45">{r.actorEmail}</span>}
                        </td>
                        <td className="py-2 text-white/75">
                          {r.reportName} <span className="text-white/40">({r.reportType})</span>
                          {r.logSeq != null && <span className="block font-mono text-[10px] text-white/40">log #{r.logSeq.toString()}</span>}
                        </td>
                        <td className="py-2">
                          <Pill tone={st.tone}>{st.label}</Pill>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2 text-right tabular-nums text-white/85">
                          {CHARGEABLE.includes(r.state) ? kes(r.totalKes) : "—"}
                          {CHARGEABLE.includes(r.state) && r.totalKes > 0 && (
                            <span className="block text-[10px] text-white/40">
                              bureau {kes(r.bureauKes)} + fee {kes(r.feeKes)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
