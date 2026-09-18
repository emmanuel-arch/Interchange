"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE CRUNCH THEATRE — ported from connected-suite's /console/crunch, kept as the
// app has it: the M-PESA backdrop, the conic Safaricom ring, the Safaricom green,
// and the same stages in the same order:
//
//   decrypt → parse → extract → post to ledgers → audit → score → factors
//
// ── THE STAGING IS THEATRE, THE NUMBERS ARE NOT ─────────────────────────────
// Only the receipt codes that flicker while the server works are placeholders.
// The extract stage WAITS for the real answer, and from that point on every
// counter, ledger bar, audit line and the score dial is the statement's own.
//
// Differences from the lending console, all deliberate:
//   · Lender wording. The officer is reading about a borrower, not "your score".
//   · No product offer. The Interchange sizes what a borrower can afford; which
//     product a member lends is that member's decision, so the theatre ends on
//     the result and its downloads instead of a starting limit.
//   · The answer comes from a `run` function, so the same component plays the
//     live engine in the portal and the published demo on the preview.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, ArrowRight, Loader2, FileText, ShieldCheck, TrendingUp, TrendingDown, Store, Landmark, X } from "lucide-react";
import type { CrunchData } from "@/lib/statement/assemble";
import type { InternalReport } from "@/lib/statement/analyze";

export const GREEN = "#4CB749";
export const GREEN_DARK = "#1E8B3A";
const AMBER = "#d97706";
const RED = "#e11d48";
const SLATE = "#94a3b8";

const LIFE_TONE: Record<string, string> = {
  Betting: RED, "Alcohol & Nightlife": "#a855f7", Fuel: "#0ea5e9", Transport: "#38bdf8",
  "Food & Dining": AMBER, Groceries: GREEN, Health: "#ef4444", Education: "#6366f1",
  Utilities: "#64748b", "Airtime & Data": "#64748b", "Rent & Housing": "#8b5cf6", Savings: GREEN,
  "Financial & Loans": AMBER, Government: "#64748b", "Retail & Shopping": "#14b8a6",
  Transfers: SLATE, "Cash / ATM": SLATE, Other: SLATE,
};
const lifeTone = (c: string) => LIFE_TONE[c] ?? SLATE;

const CAT: Record<string, { label: string; tone: string }> = {
  income_received: { label: "Received money", tone: GREEN },
  business_in: { label: "Business inflow", tone: GREEN },
  salary: { label: "Salary", tone: GREEN },
  deposit: { label: "Agent deposit", tone: GREEN },
  savings_in: { label: "Savings in", tone: GREEN },
  loan_in: { label: "Loans taken", tone: AMBER },
  send_money: { label: "Send money", tone: SLATE },
  paybill: { label: "Paybill", tone: SLATE },
  till: { label: "Buy goods (Till)", tone: SLATE },
  withdraw: { label: "Agent withdrawal", tone: SLATE },
  airtime: { label: "Airtime", tone: SLATE },
  bank_transfer: { label: "Bank transfer", tone: SLATE },
  loan_repay: { label: "Loan repayments", tone: AMBER },
  savings_out: { label: "Savings out", tone: SLATE },
  charge: { label: "Transaction charges", tone: SLATE },
  gambling: { label: "Betting", tone: RED },
  other: { label: "Other", tone: SLATE },
};
const catOf = (c: string) => CAT[c] ?? { label: c.replace(/_/g, " "), tone: SLATE };

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const short = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(Math.round(n)));

type Stage = "unlock" | "parse" | "extract" | "classify" | "audit" | "score" | "factors";
const ORDER: Stage[] = ["unlock", "parse", "extract", "classify", "audit", "score", "factors"];
const DUR: Record<Stage, number> = { unlock: 700, parse: 800, extract: 1300, classify: 1100, audit: 1300, score: 1500, factors: 0 };
const RAIL: { stage: Stage; label: string }[] = [
  { stage: "unlock", label: "Decrypt" }, { stage: "parse", label: "Parse" }, { stage: "extract", label: "Extract" },
  { stage: "classify", label: "Ledger" }, { stage: "audit", label: "Audit" }, { stage: "score", label: "Score" },
];

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
export function useCountUp(target: number, duration = 1200, active = true) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setV(target * easeOut(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return v;
}

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const fakeReceipt = () =>
  "U" + CHARS[Math.floor(Math.random() * 26)] + Array.from({ length: 8 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");

/** The spinning Safaricom ring, as the app has it. */
export function SafaricomLoader({ size = 132 }: { size?: number }) {
  return (
    <div className="relative mx-auto flex items-center justify-center" style={{ height: size, width: size }}>
      <span className="absolute inset-2 animate-ping rounded-full bg-white/15" />
      <span
        className="absolute inset-0 animate-spin rounded-full"
        style={{
          background: `conic-gradient(from 0deg, rgba(76,183,73,0) 0%, ${GREEN} 60%, #ffffff 95%, rgba(76,183,73,0) 100%)`,
          WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 7px))",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 7px))",
          animationDuration: "1.1s",
        }}
      />
      <span className="relative z-10 flex items-center justify-center rounded-2xl bg-white p-2.5 shadow-2xl ring-1 ring-white/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mpesa/safaricom-25.gif" alt="Safaricom" width={900} height={406} className="h-auto w-20 rounded-lg object-contain" />
      </span>
    </div>
  );
}

export function Glass({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md ${className}`}>{children}</div>;
}

function ExtractStage({ data }: { data: CrunchData | null }) {
  const [feed, setFeed] = useState<{ id: number; receipt: string; details: string; amount: number; direction: "in" | "out" }[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    const iv = setInterval(() => {
      const id = idRef.current++;
      const row = data?.sample?.length ? data.sample[id % data.sample.length] : null;
      setFeed((f) =>
        [
          {
            id,
            receipt: fakeReceipt(),
            details: row ? row.details : "Reading entry…",
            amount: row ? row.amount : Math.round(Math.random() * 4000) + 50,
            direction: row ? row.direction : Math.random() > 0.5 ? ("in" as const) : ("out" as const),
          },
          ...f,
        ].slice(0, 5),
      );
    }, 190);
    return () => clearInterval(iv);
  }, [data]);

  const count = useCountUp(data?.transactionCount ?? 0, 2200, !!data);
  const pIn = useCountUp(data?.paidIn ?? 0, 2200, !!data);
  const pOut = useCountUp(data?.paidOut ?? 0, 2200, !!data);

  return (
    <div className="w-full">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-widest text-white/60">Transactions extracted</p>
        <p className="text-5xl font-bold tabular-nums" style={{ color: GREEN }}>
          {data ? Math.round(count).toLocaleString() : <span className="text-white/40">····</span>}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Glass className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-white/60">Paid in</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: GREEN }}>{data ? kes(pIn) : "—"}</p>
        </Glass>
        <Glass className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-white/60">Paid out</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-white">{data ? kes(pOut) : "—"}</p>
        </Glass>
      </div>
      <div className="mt-3 min-h-[150px] space-y-1.5">
        <AnimatePresence initial={false}>
          {feed.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: -40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5"
            >
              <span className="shrink-0 font-mono text-[10px] text-white/40">{r.receipt}</span>
              <span className="flex-1 truncate text-[11px] text-white/70">{r.details}</span>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: r.direction === "in" ? GREEN : "#fff" }}>
                {r.direction === "in" ? "+" : "−"}{short(r.amount)}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ClassifyStage({ data }: { data: CrunchData }) {
  const life = data.report?.spendByCategory ?? [];
  const top = life.length
    ? life.slice(0, 8).map((c) => ({ label: c.category, count: c.count, amount: c.amount, tone: lifeTone(c.category) }))
    : data.categories.slice(0, 8).map((c) => ({ label: catOf(c.category).label, count: c.count, amount: c.amount, tone: catOf(c.category).tone }));
  const max = Math.max(...top.map((c) => c.amount), 1);
  return (
    <div className="w-full">
      <p className="text-center text-[11px] uppercase tracking-widest text-white/60">{life.length ? "Clustering the spending" : "Posting to ledgers"}</p>
      <div className="mt-3 space-y-2">
        {top.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate text-white/80">{c.label}</span>
              <span className="shrink-0 tabular-nums text-white/50">{c.count} · {kes(c.amount)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(c.amount / max) * 100}%` }}
                transition={{ delay: i * 0.07 + 0.1, duration: 0.6, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ backgroundColor: c.tone }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function ReportInsight({ report }: { report: InternalReport }) {
  const HL: Record<string, string> = { positive: GREEN, watch: AMBER, negative: RED };
  return (
    <div className="mt-5 space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/60">Customer profile</p>
        <p className="mt-1 text-[12px] leading-relaxed text-white/80">{report.lifestyle.narrative}</p>
        {report.lifestyle.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {report.lifestyle.tags.map((t) => (
              <span key={t} className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white/80">{t}</span>
            ))}
          </div>
        )}
      </div>
      {report.topMerchants.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/60"><Store className="h-3 w-3" /> Where they spend</p>
          <div className="mt-2 space-y-1">
            {report.topMerchants.slice(0, 5).map((m) => (
              <div key={m.name} className="flex items-center gap-2 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: lifeTone(m.category) }} />
                <span className="flex-1 truncate text-white/80">{m.name}</span>
                <span className="shrink-0 tabular-nums text-white/50">{kes(m.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {report.loanBehaviour.lenders.length > 0 && (
        <Glass>
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/60"><Landmark className="h-3 w-3" /> Existing credit</p>
          <div className="mt-2 space-y-1.5">
            {report.loanBehaviour.lenders.slice(0, 4).map((l) => (
              <div key={l.name} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-white/85">{l.name}</span>
                <span className="tabular-nums text-white/55">borrowed {kes(l.borrowed)} · repaid {kes(l.repaid)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">Repays {report.loanBehaviour.repaymentCadence}</span>
            {report.loanBehaviour.fulizaReliant && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-black" style={{ backgroundColor: AMBER }}>Fuliza-reliant</span>
            )}
          </div>
        </Glass>
      )}
      {report.highlights.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {report.highlights.map((h, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold"
              style={{ backgroundColor: `${HL[h.tone]}22`, color: HL[h.tone], border: `1px solid ${HL[h.tone]}55` }}
            >
              {h.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditStage({ data }: { data: CrunchData }) {
  const f = data.features;
  const monthsWithIncome = Math.round(f.incomeMonthsRatio * f.monthsCovered);
  const nc = data.nameCheck;
  const checks: { ok: boolean; text: string }[] = [
    ...(nc
      ? [{
          ok: nc.matched,
          text: nc.matched
            ? `Statement holder “${nc.statementName}” matches ${nc.expectedName}`
            : nc.statementName
              ? `Holder “${nc.statementName}” does not match ${nc.expectedName}`
              : "Could not read the holder's name from the statement header",
        }]
      : []),
    { ok: true, text: `Reconciled ${data.transactionCount.toLocaleString()} entries · closing balance ${kes(f.closingBalance)}` },
    { ok: f.incomeMonthsRatio >= 0.8, text: `Income received in ${monthsWithIncome} of ${f.monthsCovered} months` },
    { ok: f.incomeVolatility <= 0.5, text: `Income volatility ${f.incomeVolatility} (${f.incomeVolatility <= 0.5 ? "stable" : "erratic"})` },
    { ok: f.gamblingRatio <= 0.02, text: f.gamblingOutflow > 0 ? `Betting ${Math.round(f.gamblingRatio * 100)}% of outflow (${kes(f.gamblingOutflow)})` : "Betting: none detected" },
    { ok: f.loanDependencyRatio <= 0.15, text: `Loan dependency ${Math.round(f.loanDependencyRatio * 100)}% of inflow · ${f.loanEventCount} events` },
    { ok: f.avgMonthlyNet > 0, text: `Monthly surplus ${kes(f.avgMonthlyNet)} after spending` },
  ];
  return (
    <div className="w-full">
      <p className="text-center text-[11px] uppercase tracking-widest text-white/60">Running the audit</p>
      <div className="mt-3 space-y-1.5">
        {checks.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.3 }}
            className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-2"
          >
            {c.ok ? <CheckCircle2 className="mt-px h-4 w-4 shrink-0" style={{ color: GREEN }} /> : <AlertTriangle className="mt-px h-4 w-4 shrink-0" style={{ color: AMBER }} />}
            <span className="text-[12px] leading-snug text-white/80">{c.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const TONE_COLOR: Record<string, string> = { good: GREEN, warn: AMBER, high: "#f97316", bad: RED };

export function ScoreDial({ data, size = 200 }: { data: CrunchData; size?: number }) {
  const s = data.creditScore;
  const MIN = 300;
  const pctTarget = Math.max(0, Math.min(1, (s.score - MIN) / (s.maxScore - MIN)));
  const shown = useCountUp(s.score, 1800);
  const arc = useCountUp(pctTarget, 1800);
  const color = TONE_COLOR[s.tone] ?? GREEN;
  const R = 78;
  const C = 2 * Math.PI * R;
  const GAP = 0.25;
  return (
    <div className="w-full text-center">
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 200 200" className="-rotate-[225deg]">
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${C * (1 - GAP)} ${C}`} />
          <circle cx="100" cy="100" r={R} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${C * (1 - GAP) * arc} ${C}`} style={{ filter: `drop-shadow(0 0 10px ${color}66)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-5xl font-bold tabular-nums text-white">{Math.round(shown)}</p>
          <p className="text-[11px] text-white/50">of {s.maxScore}</p>
        </div>
      </div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }}>
        <p className="text-lg font-bold" style={{ color }}>{s.band}</p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/70">Default risk {s.pdPercent}</span>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-black" style={{ backgroundColor: color }}>{s.decision}</span>
        </div>
        <p className="mt-2 text-[10px] text-white/40">{s.modelVersion}</p>
      </motion.div>
    </div>
  );
}

function FactorsStage({ data, onContinue }: { data: CrunchData; onContinue: () => void }) {
  const s = data.creditScore;
  const f = data.features;
  const bars = s.breakdown.filter((b) => b.points !== 0).sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.points)), 1);
  const detailOf = (code: string) => s.reasonCodes.find((r) => r.code === code)?.detail;
  const maxNet = Math.max(...data.monthly.map((m) => Math.abs(m.net)), 1);

  return (
    <div className="w-full">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-widest text-white/60">Internal report</p>
        <p className="mt-1 text-sm text-white/70">{f.monthsCovered} months · {data.transactionCount.toLocaleString()} transactions · {f.periodStart} to {f.periodEnd}</p>
      </div>
      {data.report && <ReportInsight report={data.report} />}
      <p className="mt-6 text-[11px] uppercase tracking-widest text-white/60">What drove the score</p>
      <div className="mt-3 space-y-2.5">
        {bars.map((b, i) => {
          const up = b.points > 0;
          const detail = detailOf(b.code);
          return (
            <motion.div key={b.code} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12px] text-white/85">
                  {up ? <TrendingUp className="h-3.5 w-3.5" style={{ color: GREEN }} /> : <TrendingDown className="h-3.5 w-3.5" style={{ color: RED }} />}
                  {b.factor}
                </span>
                <span className="text-[12px] font-bold tabular-nums" style={{ color: up ? GREEN : RED }}>{up ? "+" : ""}{b.points}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div initial={{ width: 0 }} animate={{ width: `${(Math.abs(b.points) / maxAbs) * 100}%` }} transition={{ delay: i * 0.08 + 0.1, duration: 0.6 }} className="h-full rounded-full" style={{ backgroundColor: up ? GREEN : RED }} />
              </div>
              {detail && <p className="mt-0.5 text-[10px] text-white/45">{detail}</p>}
            </motion.div>
          );
        })}
      </div>
      <div className="mt-5">
        <p className="text-[11px] uppercase tracking-widest text-white/60">Monthly net cashflow</p>
        <div className="mt-2 flex h-20 items-end gap-1.5">
          {data.monthly.map((m) => {
            const h = (Math.abs(m.net) / maxNet) * 100;
            return (
              <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(6, h)}%` }} transition={{ duration: 0.6 }} className="w-full rounded-t" style={{ backgroundColor: m.net >= 0 ? GREEN : RED, opacity: 0.85 }} />
                <span className="text-[8px] text-white/40">{m.month.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <Glass className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/60">Comfortable instalment</p>
            <p className="text-xl font-bold" style={{ color: GREEN }}>{kes(data.affordability.recommendedMaxInstallment)}<span className="text-xs font-normal text-white/50">/mo</span></p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-white/60">Avg income</p>
            <p className="text-sm font-bold text-white">{kes(f.avgMonthlyIncome)}<span className="text-xs font-normal text-white/50">/mo</span></p>
          </div>
        </div>
      </Glass>
      <button
        onClick={onContinue}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})` }}
      >
        See the result and downloads <ArrowRight className="h-4 w-4" />
      </button>
      <p className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] text-white/40">
        <ShieldCheck className="h-3 w-3" /> Analysed in memory · the statement and its password are never stored
      </p>
    </div>
  );
}

export type CrunchRefusal = { statementName: string; expectedName: string; message: string };

export function CrunchTheatre({
  run,
  onComplete,
  onFail,
  onClose,
  banner,
}: {
  /** Produces the real answer. The theatre plays over it and gates on it. */
  run: (signal: AbortSignal) => Promise<CrunchData | { refusal: CrunchRefusal }>;
  onComplete: (data: CrunchData) => void;
  onFail: (message: string) => void;
  onClose?: () => void;
  /** A line pinned above the stage — "Demo · synthetic statement" on the preview. */
  banner?: string;
}) {
  const [stage, setStage] = useState<Stage>("unlock");
  const [data, setData] = useState<CrunchData | null>(null);
  const [tick, setTick] = useState(fakeReceipt());
  const [mismatch, setMismatch] = useState<CrunchRefusal | null>(null);
  const failRef = useRef(onFail);
  const runRef = useRef(run);
  useEffect(() => {
    failRef.current = onFail;
    runRef.current = run;
  }, [onFail, run]);

  useEffect(() => {
    const ac = new AbortController();
    runRef
      .current(ac.signal)
      .then((d) => {
        if ("refusal" in d) setMismatch(d.refusal);
        else setData(d);
      })
      .catch((e) => {
        if (!ac.signal.aborted) failRef.current(e instanceof Error ? e.message : "Could not read the statement.");
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (data) return;
    const iv = setInterval(() => setTick(fakeReceipt()), 110);
    return () => clearInterval(iv);
  }, [data]);

  const waiting = stage === "extract" && !data;
  useEffect(() => {
    if (stage === "factors" || waiting) return;
    const t = setTimeout(() => setStage((s) => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(s) + 1)]), DUR[stage]);
    return () => clearTimeout(t);
  }, [stage, waiting]);

  const railIdx = RAIL.findIndex((r) => r.stage === stage);
  const activeIdx = stage === "factors" ? RAIL.length : railIdx;
  const canSkip = !!data && stage !== "score" && stage !== "factors";

  const COPY: Record<Stage, { title: string; sub: string }> = {
    unlock: { title: "Decrypting the statement", sub: "Unlocking the password-protected PDF from Safaricom" },
    parse: { title: "Reading the document", sub: "Rebuilding every page, line and column" },
    extract: { title: "Extracting transactions", sub: waiting ? `Scanning entry ${tick}` : "Posting each entry to the ledger" },
    classify: { title: "Posting to ledgers", sub: "Classifying every shilling in and out" },
    audit: { title: "Running the audit", sub: "Reconciling balances and testing behaviour" },
    score: { title: "The statement's score", sub: "Built from months of real cashflow" },
    factors: { title: "The score, explained", sub: "Every factor, positive and negative" },
  };

  const backdrop = (
    <>
      <div aria-hidden className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url('/mpesa/mpesa-background.jpg')" }} />
      <div aria-hidden className="fixed inset-0 -z-10 bg-black/60 backdrop-blur-[2px]" />
    </>
  );

  if (mismatch) {
    return (
      <div className="fixed inset-0 z-[100] isolate overflow-y-auto text-white">
        {backdrop}
        <div className="flex min-h-full items-center justify-center px-4 py-8">
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl" style={{ backgroundColor: `${RED}22`, border: `2px solid ${RED}` }}>
              <AlertTriangle className="h-8 w-8" style={{ color: RED }} />
            </div>
            <h1 className="mt-4 text-xl font-bold">This is not {mismatch.expectedName}&apos;s statement</h1>
            <p className="mt-2 text-sm text-white/70">
              The statement is registered to <span className="font-bold text-white">“{mismatch.statementName}”</span>. A statement only scores the person named on it.
            </p>
            <button onClick={() => failRef.current(mismatch.message)} className="mt-5 w-full rounded-xl px-5 py-3 text-sm font-bold" style={{ backgroundColor: RED }}>
              Stop — wrong person&apos;s statement
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] isolate overflow-y-auto text-white" role="dialog" aria-modal="true" aria-label="Statement crunch">
      {backdrop}
      {onClose ? (
        <button onClick={onClose} className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white/80 hover:bg-black/60" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      ) : null}
      <div className="flex min-h-full items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {banner ? (
            <div className="mb-4 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-center text-[10.5px] font-medium uppercase tracking-[0.16em] text-white/70">{banner}</div>
          ) : null}
          <div className="mb-5 flex items-center gap-1">
            {RAIL.map((r, i) => (
              <div key={r.stage} className="flex-1">
                <div className="h-1 overflow-hidden rounded-full bg-white/15">
                  <motion.div className="h-full rounded-full" style={{ backgroundColor: GREEN }} initial={{ width: 0 }} animate={{ width: i < activeIdx ? "100%" : i === activeIdx ? "50%" : "0%" }} transition={{ duration: 0.5 }} />
                </div>
                <p className={`mt-1 text-center text-[8px] uppercase tracking-wide ${i <= activeIdx ? "text-white/70" : "text-white/30"}`}>{r.label}</p>
              </div>
            ))}
          </div>

          <div className="mb-4 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/70">
              <FileText className="h-3 w-3" /> M-PESA STATEMENT CRUNCHER
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={stage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                <h1 className="mt-2 text-xl font-bold drop-shadow">{COPY[stage].title}</h1>
                <p className="mt-1 text-[12px] text-white/70">{COPY[stage].sub}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={stage} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.28 }}>
              {(stage === "unlock" || stage === "parse") && (
                <div className="py-4">
                  <SafaricomLoader />
                  <div className="mt-6 flex items-center justify-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-white" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="mt-4 text-center font-mono text-[10px] text-white/40">{tick}</p>
                </div>
              )}
              {stage === "extract" && <ExtractStage data={data} />}
              {stage === "classify" && data && <ClassifyStage data={data} />}
              {stage === "audit" && data && <AuditStage data={data} />}
              {stage === "score" && data && <ScoreDial data={data} />}
              {stage === "factors" && data && <FactorsStage data={data} onContinue={() => onComplete(data)} />}
              {stage !== "unlock" && stage !== "parse" && stage !== "extract" && !data && (
                <div className="py-10 text-center text-white/60"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
              )}
            </motion.div>
          </AnimatePresence>

          {canSkip && (
            <button onClick={() => setStage("score")} className="mt-5 w-full text-center text-[11px] text-white/45 hover:text-white/80">
              Skip to the score
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
