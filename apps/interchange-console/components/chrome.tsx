// Shared console chrome. The gate establishes the visual language (dark ground,
// instrument type, emerald = verified / amber = pending / red = refused); these
// are the pieces that carry it into the console proper.
import type { ReactNode } from "react";

export function InterchangeMark({ className = "w-5 h-5" }: { className?: string }) {
  // Two routes crossing without merging — the whole architecture in one glyph.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path d="M3 8 C 9 8, 15 16, 21 16" stroke="rgb(16 185 129 / 0.85)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 16 C 9 16, 15 8, 21 8" stroke="rgb(16 185 129 / 0.45)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  right,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6 pb-5 mb-6 border-b border-white/[0.07]">
      <div className="min-w-0">
        <div className="inst text-[9px] text-emerald-500/70 mb-2">{eyebrow}</div>
        <h1 className="font-mono text-2xl font-bold uppercase tracking-[0.14em] text-white/90">
          {title}
        </h1>
        {lede ? (
          <p className="mt-2 text-sm text-white/50 max-w-[62ch] leading-relaxed">{lede}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  hint,
  children,
}: {
  title?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="relative border border-white/[0.07] rounded-xl bg-white/[0.012] overflow-hidden">
      <div aria-hidden className="absolute top-0 left-0 w-4 h-4 border-t border-l border-emerald-500/20 rounded-tl-xl" />
      <div aria-hidden className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-emerald-500/20 rounded-br-xl" />
      {title ? (
        <header className="px-5 py-3 border-b border-white/[0.06] flex items-baseline justify-between gap-4">
          <h2 className="inst text-[9px] text-white/40">{title}</h2>
          {hint ? <span className="font-mono text-[9px] text-white/25">{hint}</span> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

type Tone = "ok" | "pending" | "bad" | "mute";

const TONE: Record<Tone, string> = {
  ok: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25",
  pending: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  bad: "bg-red-500/10 text-red-300 border-red-500/25",
  mute: "bg-white/[0.04] text-white/35 border-white/[0.08]",
};

export function Pill({ tone = "mute", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block border rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.09em] whitespace-nowrap ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Member lifecycle → tone. SHADOW is amber on purpose: contributing, not yet trusted to query. */
export function memberTone(status: string): Tone {
  if (status === "ACTIVE") return "ok";
  if (status === "SHADOW") return "pending";
  if (status === "SUSPENDED") return "bad";
  return "mute";
}

export function outcomeTone(outcome: string): Tone {
  if (outcome === "GRANTED") return "ok";
  if (outcome === "ERROR") return "mute";
  return "bad";
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">
      {children}
    </div>
  );
}

export function Num({ children }: { children: ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>;
}
