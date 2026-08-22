import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, Pill, Empty } from "@/components/chrome";
import { comparePromotion, champion, scoreWith } from "@/lib/scoring/registry";
import { computeVector } from "@/lib/features/store";
import { interchangeScore } from "@/lib/reports/crb2";
import { TOOLS } from "@/lib/ai/tools";

export const dynamic = "force-dynamic";

type Metrics = { auc: number; ks: number; gini: number; n: number; bads: number; ecosystemRows: number };

export default async function ScorePage() {
  const models = await prisma.modelVersion.findMany({ orderBy: { trainedAt: "desc" }, take: 12 });
  const champ = await champion();
  const comparisons = await comparePromotion();

  // Score one real borrower so the reason codes are demonstrable, not described.
  let sample: ReturnType<typeof interchangeScore> | null = null;
  if (champ) {
    const d = await prisma.decision.findFirst({ orderBy: { at: "desc" } });
    if (d) {
      const v = await computeVector(d.subjectToken, new Date());
      sample = interchangeScore(scoreWith(champ, v.values));
    }
  }

  const cm = champ ? (champ.metrics as unknown as Metrics) : null;

  return (
    <>
      <PageHeader
        eyebrow="Plane B · report 3"
        title="Interchange Score"
        lede="A 300–850 score with reason codes, trained on labelled decisions including the applicants this member declined. Challengers shadow-score live traffic and are promoted only on measured lift over the champion."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.07] border border-white/[0.07] rounded-xl overflow-hidden mb-7">
        {[
          { v: cm ? cm.auc.toFixed(3) : "—", l: "Champion AUC (held out)" },
          { v: cm ? cm.ks.toFixed(3) : "—", l: "KS" },
          { v: cm ? String(cm.ecosystemRows) : "—", l: "Reject-inferred training rows" },
          { v: String(models.filter((m) => m.status === "CHALLENGER").length), l: "Challengers shadowing" },
        ].map((s) => (
          <div key={s.l} className="bg-[#070a09] px-4 py-4">
            <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 leading-none mb-2">{s.v}</div>
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="border border-amber-500/25 bg-amber-500/[0.05] rounded-xl px-5 py-4 mb-7">
        <div className="inst text-[9px] text-amber-300 mb-1.5">Read the AUC honestly</div>
        <p className="text-[12px] text-white/60 leading-relaxed max-w-[78ch]">
          The champion is barely better than chance on this data, and that is reported rather than
          hidden. The fixture generates outcomes with deliberate noise, and the strongest real
          predictors — the 38 M-Pesa cashflow features — are not wired yet. What <em>is</em>
          established is that the trainer finds signal when signal exists: on a planted separable
          dataset it reaches AUC 1.000, and its reason-code contributions sum exactly to the logit.
          A weak number here means weak data, not a broken pipeline.
        </p>
      </div>

      <div className="space-y-7">
        <Panel title="Model registry" hint="promotion is a status change, not a deploy">
          {models.length === 0 ? (
            <Empty>No models trained — run npm run train</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    {["Version", "Algorithm", "Status", "AUC", "KS", "Train rows", "Test window"].map((h) => (
                      <th key={h} className="px-5 py-2.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => {
                    const mm = m.metrics as unknown as Metrics;
                    return (
                      <tr key={m.id} className="border-b border-white/[0.04]">
                        <td className="px-5 py-2.5 font-mono text-[10px] text-white/70">{m.version}</td>
                        <td className="px-5 py-2.5 font-mono text-[10px] text-white/45">{m.algorithm}</td>
                        <td className="px-5 py-2.5">
                          <Pill tone={m.status === "CHAMPION" ? "ok" : m.status === "CHALLENGER" ? "pending" : "mute"}>
                            {m.status}
                          </Pill>
                        </td>
                        <td className="px-5 py-2.5 font-mono text-[10px] tabular-nums text-white/60">{mm.auc.toFixed(3)}</td>
                        <td className="px-5 py-2.5 font-mono text-[10px] tabular-nums text-white/45">{mm.ks.toFixed(3)}</td>
                        <td className="px-5 py-2.5 font-mono text-[10px] tabular-nums text-white/45">{m.trainedOnRows}</td>
                        <td className="px-5 py-2.5 font-mono text-[9px] text-white/30 whitespace-nowrap">
                          {m.testStart.toISOString().slice(0, 10)} → {m.testEnd.toISOString().slice(0, 10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Promotion" hint="lift must clear the noise band">
          {comparisons.length === 0 ? (
            <Empty>No challengers</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {comparisons.map((c) => (
                <li key={c.challengerVersion} className="px-5 py-3 flex items-center gap-4 text-[12px]">
                  <Pill tone={c.verdict === "promote" ? "ok" : "mute"}>{c.verdict}</Pill>
                  <span className="font-mono text-[10px] text-white/60 w-56 truncate">{c.challengerVersion}</span>
                  <span className="text-white/45">{c.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {sample ? (
          <Panel title="Reason codes" hint="a real borrower, scored by the champion">
            <div className="px-5 py-4">
              <div className="flex items-baseline gap-4 mb-4">
                <span className="font-mono text-4xl font-bold tabular-nums text-emerald-400">
                  {(sample.data as { score: number }).score}
                </span>
                <span className="font-mono text-[10px] text-white/35">
                  pd {(sample.data as { probability_of_default: number }).probability_of_default} ·{" "}
                  {(sample.data as { model_version: string }).model_version}
                </span>
              </div>
              <ol className="space-y-2">
                {((sample.data as { reason_codes: { rank: number; factor: string; direction: string; family: string }[] }).reason_codes).map((r) => (
                  <li key={r.rank} className="flex items-center gap-3 text-[12px]">
                    <span className="font-mono text-[9px] text-white/25 w-4">{r.rank}</span>
                    <Pill tone={r.direction === "raises risk" ? "bad" : "ok"}>{r.direction}</Pill>
                    <span className="text-white/70">{r.factor}</span>
                    <span className="font-mono text-[9px] text-white/25">{r.family}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-[11.5px] text-white/40 leading-relaxed max-w-[74ch]">
                For the logistic champion these contributions are <em>exact</em> — the model is
                additive, so they are the Shapley values rather than an approximation of them. That
                is why the simpler model is the champion: a lender has to be able to tell a declined
                borrower why, and &ldquo;the model said so&rdquo; is not an answer a regulator accepts.
              </p>
            </div>
          </Panel>
        ) : null}

        <Panel title="ServiceSuite AI tools" hint="consent enforced in the tool, never the prompt">
          <ul className="divide-y divide-white/[0.05]">
            {TOOLS.map((t) => (
              <li key={t.name} className="px-5 py-3">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-[11px] text-emerald-300/80">{t.name}</span>
                  <Pill tone="mute">{t.service}</Pill>
                </div>
                <p className="text-[11.5px] text-white/45 leading-relaxed max-w-[78ch]">{t.description}</p>
              </li>
            ))}
          </ul>
          <p className="px-5 pb-4 pt-1 text-[11.5px] text-white/40 leading-relaxed max-w-[78ch]">
            The caller&rsquo;s identity comes from the session, never from anything the model
            produced. A model that could name its own caller could read any member&rsquo;s data —
            so the tool decides, and the model only ever asks.
          </p>
        </Panel>
      </div>
    </>
  );
}
