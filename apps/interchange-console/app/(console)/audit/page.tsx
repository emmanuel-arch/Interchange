import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, Pill, outcomeTone, Empty } from "@/components/chrome";
import { tokenPreview } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const [entries, granted, refused] = await Promise.all([
    prisma.auditEntry.findMany({
      orderBy: { at: "desc" },
      take: 50,
      include: {
        caller: { select: { name: true, code: true } },
        service: { select: { name: true, code: true } },
      },
    }),
    prisma.auditEntry.count({ where: { outcome: "GRANTED" } }),
    prisma.auditEntry.count({ where: { NOT: { outcome: "GRANTED" } } }),
  ]);

  const total = granted + refused;
  const p95 = (() => {
    const l = entries.map((e) => e.latencyMs).filter((x): x is number => x !== null).sort((a, b) => a - b);
    if (!l.length) return null;
    return l[Math.min(l.length - 1, Math.floor(l.length * 0.95))];
  })();

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Audit"
        lede="Every call the gate decided, answered or refused. A refusal that leaves no trace is indistinguishable from a call that never happened — so refusals are recorded with the same weight as grants."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.07] border border-white/[0.07] rounded-xl overflow-hidden mb-7">
        {[
          { v: total.toLocaleString(), l: "Calls decided" },
          { v: granted.toLocaleString(), l: "Granted" },
          { v: refused.toLocaleString(), l: "Refused" },
          { v: p95 === null ? "—" : `${p95}ms`, l: "Gate p95 (budget 400ms)" },
        ].map((s) => (
          <div key={s.l} className="bg-[#070a09] px-4 py-4">
            <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 leading-none mb-2">{s.v}</div>
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">{s.l}</div>
          </div>
        ))}
      </div>

      <Panel title="Call log" hint={entries.length ? `latest ${entries.length}` : undefined}>
        {entries.length === 0 ? (
          <Empty>No calls yet — POST /api/authorise to exercise the gate</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {["When", "Caller", "Service", "Subject", "Outcome", "Why", "ms"].map((h) => (
                    <th key={h} className="px-5 py-2.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 font-bold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-2.5 font-mono text-[10px] text-white/30 whitespace-nowrap">
                      {e.at.toISOString().slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="px-5 py-2.5 text-[12px] text-white/70 whitespace-nowrap">{e.caller.name}</td>
                    <td className="px-5 py-2.5 font-mono text-[10px] text-white/50 whitespace-nowrap">{e.service.code}</td>
                    <td className="px-5 py-2.5 font-mono text-[10px] text-emerald-300/55 whitespace-nowrap">
                      {tokenPreview(e.subjectToken)}
                    </td>
                    <td className="px-5 py-2.5"><Pill tone={outcomeTone(e.outcome)}>{e.outcome}</Pill></td>
                    <td className="px-5 py-2.5 text-[11px] text-white/40 max-w-[26ch] truncate">{e.detail ?? "—"}</td>
                    <td className="px-5 py-2.5 font-mono text-[10px] tabular-nums text-white/40 text-right">
                      {e.latencyMs ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
