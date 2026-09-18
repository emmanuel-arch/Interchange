"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Lock, User, Play, Braces, Sheet, RotateCcw, ShieldCheck, Layers, FileDown } from "lucide-react";
import { CrunchTheatre, ScoreDial, Glass, ReportInsight, kes, GREEN, GREEN_DARK } from "./CrunchTheatre";
import type { CrunchData } from "@/lib/statement/assemble";

type Phase = "intro" | "theatre" | "result";

const DEMO_RESULT = "/preview/crunch/crunch-result.json";
const DEMO_CSV = "/preview/crunch/transactions.csv";
const DEMO_PDF = "/preview/crunch/crunch-report.pdf";

export function CrunchDemo() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [data, setData] = useState<CrunchData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The demo's "server": the engine's output for the synthetic statement, fetched
  // with the pause a real upload and parse would take, so the theatre gates on it
  // exactly as it gates on the live route.
  const run = useCallback(async (signal: AbortSignal) => {
    const [res] = await Promise.all([fetch(DEMO_RESULT, { signal }), new Promise((r) => setTimeout(r, 1800))]);
    if (!res.ok) throw new Error("The demo result could not be loaded.");
    return (await res.json()) as CrunchData;
  }, []);

  return (
    <>
      <section className="relative isolate overflow-hidden rounded-3xl border border-white/10">
        <div aria-hidden className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url('/mpesa/mpesa-background.jpg')" }} />
        <div aria-hidden className="absolute inset-0 -z-10 bg-black/70 backdrop-blur-[2px]" />

        {phase !== "result" ? (
          <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1fr_420px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/70">
                Demo · synthetic statement · production engine
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">Crunch an M-PESA statement.</h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/70">
                The transactions in this statement were written for the demo. Everything you are about to watch is computed from
                them by the same parser, classifier, audit and scorecard a member&apos;s live crunch runs.
              </p>
              <ul className="mt-6 space-y-2 text-[14px] text-white/75">
                <li className="flex items-center gap-2"><Layers className="h-4 w-4 text-[#9fe39c]" /> Queue several statements; each keeps its own progress and result.</li>
                <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#9fe39c]" /> The PDF and its password are processed in memory and never stored.</li>
              </ul>
            </div>

            <Glass className="p-5 sm:p-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-black/30 px-4 py-3">
                  <FileText className="h-5 w-5 shrink-0" style={{ color: GREEN }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] text-white">MPESA_Statement_sample.pdf</div>
                    <div className="text-[12px] text-white/50">Six months · synthetic</div>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[12px] text-white/60"><Lock className="h-3.5 w-3.5" /> Statement password</span>
                  <input readOnly value="••••••" className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 font-mono text-[14px] text-white/80 outline-none" aria-label="Statement password (demo)" />
                  <span className="mt-1 block text-[11px] text-white/40">From Safaricom&apos;s SMS. On older statements it is the ID number.</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[12px] text-white/60"><User className="h-3.5 w-3.5" /> Borrower on the enquiry</span>
                  <input readOnly value="AMANI JABALI MWENDA" className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[14px] text-white/80 outline-none" aria-label="Borrower name (demo)" />
                </label>
                <button
                  onClick={() => {
                    setError(null);
                    setPhase("theatre");
                  }}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-bold text-white shadow-lg transition hover:brightness-110"
                  style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})` }}
                >
                  <Play className="h-4 w-4" /> Crunch statement
                </button>
                {error ? <p className="text-center text-[13px] text-red-300">{error}</p> : null}
              </div>
            </Glass>
          </div>
        ) : data ? (
          <Result data={data} onAgain={() => setPhase("theatre")} />
        ) : null}
      </section>

      {phase === "theatre" ? (
        <CrunchTheatre
          run={run}
          banner="Demo · synthetic statement · production engine"
          onClose={() => setPhase(data ? "result" : "intro")}
          onFail={(m) => {
            setError(m);
            setPhase("intro");
          }}
          onComplete={(d) => {
            setData(d);
            setPhase("result");
          }}
        />
      ) : null}
    </>
  );
}

function Result({ data, onAgain }: { data: CrunchData; onAgain: () => void }) {
  const f = data.features;
  const tiles = [
    { k: "Average income", v: `${kes(f.avgMonthlyIncome)}/mo` },
    { k: "Average spend", v: `${kes(f.avgMonthlyExpense)}/mo` },
    { k: "Monthly surplus", v: `${kes(f.avgMonthlyNet)}/mo` },
    { k: "Comfortable instalment", v: `${kes(data.affordability.recommendedMaxInstallment)}/mo`, accent: true },
    { k: "Betting share of outflow", v: `${(f.gamblingRatio * 100).toFixed(1)}%` },
    { k: "Loan dependency", v: `${Math.round(f.loanDependencyRatio * 100)}% of inflow` },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[300px_1fr]">
      <div>
        <ScoreDial data={data} size={220} />
        <div className="mt-6 space-y-2">
          <a href={DEMO_PDF} download className="flex items-center gap-3 rounded-xl border border-[#4CB749]/50 bg-[#4CB749]/15 px-4 py-3 text-[14px] font-medium text-white hover:bg-[#4CB749]/25">
            <FileDown className="h-4 w-4" style={{ color: GREEN }} /> Cashflow &amp; Affordability PDF
          </a>
          <a href={DEMO_RESULT} download className="flex items-center gap-3 rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[14px] text-white/85 hover:border-[#4CB749]/60">
            <Braces className="h-4 w-4" style={{ color: GREEN }} /> Result JSON
          </a>
          <a href={DEMO_CSV} download className="flex items-center gap-3 rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[14px] text-white/85 hover:border-[#4CB749]/60">
            <Sheet className="h-4 w-4" style={{ color: GREEN }} /> Transactions CSV ({data.transactionCount})
          </a>
          <button onClick={onAgain} className="flex w-full items-center gap-3 rounded-xl border border-white/15 px-4 py-3 text-left text-[14px] text-white/70 hover:bg-white/5">
            <RotateCcw className="h-4 w-4" /> Watch the theatre again
          </button>
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">
          {f.monthsCovered} months · {data.transactionCount} transactions · {f.periodStart} to {f.periodEnd}
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Affordability, read from the statement itself</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <Glass key={t.k} className="p-3.5">
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-white/50">{t.k}</div>
              <div className="mt-1 font-mono text-[17px] font-semibold tabular-nums" style={{ color: t.accent ? GREEN : "#fff" }}>{t.v}</div>
            </Glass>
          ))}
        </div>
        <ReportInsight report={data.report} />
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-[13.5px] leading-relaxed text-amber-50/90">
          The statement scores well, and it also shows {data.report.loanBehaviour.lenders.length} lenders already being serviced. A statement
          sees the lenders that move money through M-PESA; an exposure query sees every member&apos;s live book. Read together, they are the
          decision.
        </div>
      </div>
    </motion.div>
  );
}
