import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, Pill, outcomeTone, Empty } from "@/components/chrome";
import { tokenPreview } from "@/lib/oprf/node";
import { verifyChain } from "@/lib/messagelog";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const [entries, total, unstamped, report] = await Promise.all([
    prisma.messageLogEntry.findMany({ orderBy: { seq: "desc" }, take: 40 }),
    prisma.messageLogEntry.count(),
    prisma.messageLogEntry.count({ where: { timestampedAt: null } }),
    // Re-derives every hash on page load. Fine at this size; at scale this
    // becomes a scheduled job that verifies incrementally from the last
    // known-good anchor rather than from genesis.
    verifyChain(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Message Log"
        lede="Append-only and hash-chained. Each entry commits to the one before it, so an entry cannot be removed or edited without breaking every hash after it. This is what lets a member prove what they sent — and prove what they did not."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.07] border border-white/[0.07] rounded-xl overflow-hidden mb-7">
        <div className="bg-[#070a09] px-4 py-4">
          <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 leading-none mb-2">
            {total.toLocaleString()}
          </div>
          <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">
            Entries in chain
          </div>
        </div>
        <div className="bg-[#070a09] px-4 py-4">
          <div
            className={`font-mono text-2xl font-bold leading-none mb-2 ${
              report.ok ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {report.ok ? "INTACT" : "BROKEN"}
          </div>
          <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">
            Chain integrity
          </div>
        </div>
        <div className="bg-[#070a09] px-4 py-4">
          <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 leading-none mb-2">
            {report.checked.toLocaleString()}
          </div>
          <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">
            Hashes re-derived
          </div>
        </div>
        <div className="bg-[#070a09] px-4 py-4">
          <div
            className={`font-mono text-2xl font-bold tabular-nums leading-none mb-2 ${
              unstamped > 0 ? "text-amber-400" : "text-emerald-400"
            }`}
          >
            {unstamped.toLocaleString()}
          </div>
          <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">
            Awaiting RFC 3161 anchor
          </div>
        </div>
      </div>

      {!report.ok ? (
        <div className="border border-red-500/30 bg-red-500/[0.07] rounded-xl px-5 py-4 mb-7">
          <div className="inst text-[9px] text-red-300 mb-1.5">Chain broken</div>
          <p className="text-[12px] text-white/70">
            Entry {report.brokenAt?.toString()}: {report.reason}
          </p>
        </div>
      ) : null}

      {unstamped > 0 ? (
        <div className="border border-amber-500/25 bg-amber-500/[0.05] rounded-xl px-5 py-4 mb-7">
          <div className="inst text-[9px] text-amber-300 mb-1.5">Not yet anchored</div>
          <p className="text-[12px] text-white/60">
            Batch timestamping against an RFC 3161 authority is not wired up yet, so the
            chain proves internal consistency but not <em>when</em> it was written. Until
            it is, a holder of this database could rebuild the whole chain from genesis.
          </p>
        </div>
      ) : null}

      <Panel title="Chain" hint={entries.length ? `latest ${entries.length}` : undefined}>
        {entries.length === 0 ? (
          <Empty>Chain is empty — POST /api/exchange to append</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {["Seq", "When", "Caller", "Service", "Subject", "Outcome", "Hash", "Prev"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 font-bold whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.seq.toString()} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[10px] tabular-nums text-emerald-400/80">
                      {e.seq.toString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-white/30 whitespace-nowrap">
                      {e.at.toISOString().slice(11, 19)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-white/60 whitespace-nowrap">{e.callerCode}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-white/50 whitespace-nowrap">{e.serviceCode}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-emerald-300/50 whitespace-nowrap">
                      {tokenPreview(e.subjectToken)}
                    </td>
                    <td className="px-4 py-2.5"><Pill tone={outcomeTone(e.outcome)}>{e.outcome}</Pill></td>
                    <td className="px-4 py-2.5 font-mono text-[9px] text-white/45">{e.hash.slice(0, 12)}…</td>
                    <td className="px-4 py-2.5 font-mono text-[9px] text-white/25">{e.prevHash.slice(0, 12)}…</td>
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
