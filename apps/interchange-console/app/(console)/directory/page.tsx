import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, Pill, memberTone, Empty, Num } from "@/components/chrome";

export const dynamic = "force-dynamic";

/** Days since a member last published a contribution, or null if never. */
function daysSince(d: Date | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/**
 * Reciprocity is COMPUTED, never asserted. A member who has not contributed in
 * over 30 days is stale regardless of what their agreement says — that is the
 * whole point of binding access to contribution in code rather than in a clause.
 */
function contribution(last: Date | null) {
  const d = daysSince(last);
  if (d === null) return { tone: "mute" as const, label: "never" };
  if (d === 0) return { tone: "ok" as const, label: "today" };
  if (d <= 7) return { tone: "ok" as const, label: `${d}d ago` };
  if (d <= 30) return { tone: "pending" as const, label: `${d}d ago` };
  return { tone: "bad" as const, label: `${d}d ago` };
}

// Postgres orders an enum by DECLARATION order, which would put PROSPECT above
// ACTIVE. Rank explicitly instead: the members carrying the network lead, the
// ones who have stopped contributing sink.
const STATUS_RANK: Record<string, number> = { ACTIVE: 0, SHADOW: 1, PROSPECT: 2, SUSPENDED: 3 };

export default async function DirectoryPage() {
  const [unsorted, services] = await Promise.all([
    prisma.member.findMany({
      include: { _count: { select: { subscriptions: true, consents: true } } },
    }),
    prisma.service.findMany({ orderBy: [{ kind: "asc" }, { reportType: "asc" }] }),
  ]);

  const members = [...unsorted].sort(
    (a, b) =>
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) || b.loans - a.loans,
  );

  const active = members.filter((m) => m.status === "ACTIVE");
  const totals = active.reduce(
    (a, m) => ({ borrowers: a.borrowers + m.borrowers, loans: a.loans + m.loans }),
    { borrowers: 0, loans: 0 },
  );

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Member Directory"
        lede="Who is on the road, what they may call, and whether they are still contributing. Access follows contribution automatically — a member who stops publishing stops being able to query, without anyone renegotiating anything."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.07] border border-white/[0.07] rounded-xl overflow-hidden mb-7">
        {[
          { v: active.length, l: "Active members" },
          { v: members.filter((m) => m.status === "SHADOW").length, l: "In shadow period" },
          { v: totals.borrowers.toLocaleString(), l: "Borrowers reachable" },
          { v: totals.loans.toLocaleString(), l: "Loans reachable" },
        ].map((s) => (
          <div key={s.l} className="bg-[#070a09] px-4 py-4">
            <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 leading-none mb-2">
              {s.v}
            </div>
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">
              {s.l}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-7">
        <Panel title="Members" hint={`${members.length} organisations`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {["Member", "Code", "Status", "Book", "Source", "Contributed"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 font-bold whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const c = contribution(m.lastContributionAt);
                  return (
                    <tr key={m.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 text-sm text-white/85">{m.name}</td>
                      <td className="px-5 py-3 font-mono text-[10px] text-white/40 whitespace-nowrap">{m.code}</td>
                      <td className="px-5 py-3"><Pill tone={memberTone(m.status)}>{m.status}</Pill></td>
                      <td className="px-5 py-3 font-mono text-[10px] tabular-nums text-white/55 whitespace-nowrap">
                        {m.borrowers.toLocaleString()} <span className="text-white/25">borrowers</span>
                        <br />
                        {m.loans.toLocaleString()} <span className="text-white/25">loans</span>
                      </td>
                      <td className="px-5 py-3 font-mono text-[9px] text-white/35 whitespace-nowrap">
                        {m.sourceHost ?? "—"}
                        {m.sourceEntityId !== null ? (
                          <>
                            <br />
                            <span className="text-emerald-500/60">EntityID {m.sourceEntityId}</span>
                          </>
                        ) : null}
                      </td>
                      <td className="px-5 py-3"><Pill tone={c.tone}>{c.label}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Services" hint="the catalogue members may subscribe to">
          {services.length === 0 ? (
            <Empty>No services registered</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {services.map((s) => (
                <li key={s.id} className="px-5 py-4 flex items-start gap-4">
                  <div className="w-14 shrink-0 pt-0.5">
                    <span className="font-mono text-[10px] tabular-nums text-emerald-500/70">
                      {s.reportType !== null ? String(s.reportType).padStart(2, "0") : "—"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-white/85">
                        {s.name}
                      </span>
                      <Pill tone="mute">{s.kind}</Pill>
                      <Pill tone={s.live ? "ok" : "pending"}>{s.live ? "live" : "specified"}</Pill>
                    </div>
                    <p className="text-[12px] text-white/45 leading-relaxed mb-2">{s.description}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/25 mr-1">
                        requires
                      </span>
                      {s.requiredScopes.map((sc) => (
                        <span
                          key={sc}
                          className="font-mono text-[8px] text-emerald-300/60 border border-emerald-500/15 bg-emerald-500/[0.06] rounded px-1.5 py-0.5"
                        >
                          {sc}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right hidden sm:block">
                    <div className="font-mono text-[9px] text-white/25 uppercase tracking-[0.14em]">code</div>
                    <div className="font-mono text-[10px] text-white/50"><Num>{s.code}</Num></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
