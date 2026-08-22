import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, Pill, Empty } from "@/components/chrome";
import { loopCoverage, PERFORMANCE_WINDOW_DAYS, DEFAULT_DPD } from "@/lib/labelling";
import { FEATURES, PENDING_FAMILIES, FEATURE_SET_VERSION } from "@/lib/features/definitions";
import { psi, interpret } from "@/lib/drift";

export const dynamic = "force-dynamic";

const TONE = { stable: "ok", moderate: "pending", significant: "bad" } as const;

export default async function LearningPage() {
  const cov = await loopCoverage();

  const approvedBad = await prisma.decision.count({ where: { labelSource: "OWN_BOOK", label: "DEFAULTED" } });
  const rejectBad = await prisma.decision.count({ where: { labelSource: "ECOSYSTEM", label: "DEFAULTED" } });
  const approvedRate = cov.ownLabelled ? approvedBad / cov.ownLabelled : 0;
  const rejectRate = cov.rejectsRecovered ? rejectBad / cov.rejectsRecovered : 0;

  const decisions = await prisma.decision.findMany({ orderBy: { at: "asc" }, select: { features: true } });
  const half = Math.floor(decisions.length / 2);
  const drift = FEATURES.map((f) => {
    const older = decisions.slice(0, half).map((d) => (d.features as Record<string, number>)[f.name] ?? 0);
    const newer = decisions.slice(half).map((d) => (d.features as Record<string, number>)[f.name] ?? 0);
    const v = psi(older, newer);
    return { name: f.name, family: f.family, psi: v, verdict: interpret(v) };
  }).sort((a, b) => b.psi - a.psi);

  const plannedTotal = PENDING_FAMILIES.reduce((a, p) => a + p.planned, 0);

  return (
    <>
      <PageHeader
        eyebrow="Plane B"
        title="Learning Loop"
        lede="Every credit decision is frozen with the exact feature vector that produced it, then labelled once the outcome settles. The number that matters is how many DECLINED applicants carry an observed label — for a lender operating alone, that is structurally zero forever."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/[0.07] border border-white/[0.07] rounded-xl overflow-hidden mb-7">
        {[
          { v: cov.total.toLocaleString(), l: "Decisions captured" },
          { v: cov.labelledTotal.toLocaleString(), l: "Labelled" },
          { v: cov.rejectsRecovered.toLocaleString(), l: "Rejects recovered" },
          { v: `${(cov.rejectCoverage * 100).toFixed(0)}%`, l: "Reject coverage" },
          { v: cov.immature.toLocaleString(), l: "Immature" },
        ].map((s) => (
          <div key={s.l} className="bg-[#070a09] px-4 py-4">
            <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 leading-none mb-2">{s.v}</div>
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="space-y-7">
        <Panel title="Selection bias, measured" hint="why reject inference is the point">
          <div className="px-5 py-5">
            <div className="flex flex-wrap gap-10 mb-4">
              <div>
                <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 mb-1.5">
                  Default rate — applicants we approved
                </div>
                <div className="font-mono text-3xl font-bold tabular-nums text-emerald-400">
                  {(approvedRate * 100).toFixed(1)}%
                </div>
                <div className="font-mono text-[9px] text-white/25 mt-1">{cov.ownLabelled} labelled</div>
              </div>
              <div>
                <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 mb-1.5">
                  Default rate — applicants we DECLINED
                </div>
                <div className="font-mono text-3xl font-bold tabular-nums text-amber-400">
                  {(rejectRate * 100).toFixed(1)}%
                </div>
                <div className="font-mono text-[9px] text-white/25 mt-1">
                  {cov.rejectsRecovered} recovered from other members
                </div>
              </div>
            </div>
            <p className="text-[12px] text-white/50 leading-relaxed max-w-[74ch]">
              A lender only ever observes the applicants it approved. Train on those alone and the
              model learns to reproduce the existing credit policy rather than to predict repayment
              — it never sees the right-hand column, so it cannot know whether the policy that
              produced it was any good. The standard remedies all try to <em>guess</em> what would
              have happened to the rejected. Inside the ecosystem there is nothing to guess:
              a borrower we declined who borrowed elsewhere produces a real, observed outcome.
            </p>
          </div>
        </Panel>

        <Panel title="Label policy" hint="conservative by design">
          <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-5 text-[12px]">
            {[
              ["Performance window", `${PERFORMANCE_WINDOW_DAYS} days`],
              ["Default threshold", `${DEFAULT_DPD}+ DPD`],
              ["Feature set", FEATURE_SET_VERSION],
              ["Unlabelled", `${cov.immature} immature`],
            ].map(([l, v]) => (
              <div key={l}>
                <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 mb-1">{l}</div>
                <div className="font-mono text-white/75">{v}</div>
              </div>
            ))}
          </div>
          <p className="px-5 pb-4 text-[11.5px] text-white/45 leading-relaxed max-w-[74ch]">
            A row stays unlabelled unless the outcome was actually observed. An unlabelled example
            is far less damaging than a wrongly labelled one — a wrong label is indistinguishable
            from signal, and the model will learn it.
          </p>
        </Panel>

        <Panel title="Feature drift" hint="population stability index">
          {drift.length === 0 ? (
            <Empty>No decisions captured yet</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    {["Feature", "Family", "PSI", "Reading"].map((h) => (
                      <th key={h} className="px-5 py-2.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drift.slice(0, 10).map((d) => (
                    <tr key={d.name} className="border-b border-white/[0.04]">
                      <td className="px-5 py-2.5 font-mono text-[10px] text-white/70">{d.name}</td>
                      <td className="px-5 py-2.5 font-mono text-[9px] text-white/35">{d.family}</td>
                      <td className="px-5 py-2.5 font-mono text-[10px] tabular-nums text-white/60">{d.psi.toFixed(4)}</td>
                      <td className="px-5 py-2.5"><Pill tone={TONE[d.verdict]}>{d.verdict}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Feature registry" hint={`${FEATURES.length} live · ${plannedTotal} pending`}>
          <div className="px-5 py-4">
            <p className="text-[12px] text-white/50 leading-relaxed mb-4 max-w-[74ch]">
              One definition per feature, used by both training and serving. The moment a feature is
              computed one way in a notebook and another way in production, the model is scoring on
              something it was never trained on — and no metric will tell you.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {FEATURES.map((f) => (
                <span key={f.name} className="font-mono text-[9px] text-emerald-300/60 border border-emerald-500/15 bg-emerald-500/[0.06] rounded px-2 py-0.5">
                  {f.name}
                </span>
              ))}
            </div>
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 mb-2">
              Declared, not yet sourced
            </div>
            <ul className="space-y-1.5">
              {PENDING_FAMILIES.map((p) => (
                <li key={p.family} className="flex items-center gap-3 text-[11.5px]">
                  <span className="font-mono text-white/55 w-44">{p.family}</span>
                  <Pill tone="pending">{p.planned} planned</Pill>
                  <span className="text-white/35">{p.source}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </>
  );
}
