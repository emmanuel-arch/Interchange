"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The exposure radar — what a lender watches while the network answers.
//
// On the public site this is an ILLUSTRATION and says so: the members are
// unnamed, the timings are drawn, and the loop replays. In the portal the same
// component is fed the broker's real per-member answers and latencies.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

export type RadarMember = { label: string; angle: number; distance: number; state: "waiting" | "holds" | "clear" | "silent"; ms?: number; reason?: string };

const SCRIPT: Omit<RadarMember, "state">[] = [
  { label: "Member node 1", angle: 30, distance: 0.62, ms: 41 },
  { label: "Member node 2", angle: 118, distance: 0.8, ms: 57 },
  { label: "Member node 3", angle: 200, distance: 0.55, ms: 38 },
  { label: "Member node 4", angle: 292, distance: 0.74, ms: 66 },
];
const OUTCOME: RadarMember["state"][] = ["holds", "clear", "holds", "silent"];

export function ExposureRadar({ members: live }: { members?: RadarMember[] }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (live) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setTick(99);
      return;
    }
    const id = setInterval(() => setTick((t) => (t + 1) % 8), 700);
    return () => clearInterval(id);
  }, [live]);

  const members: RadarMember[] =
    live ??
    SCRIPT.map((m, i) => ({
      ...m,
      state: tick >= i + 2 ? OUTCOME[i] : "waiting",
      reason: OUTCOME[i] === "silent" ? "timeout" : undefined,
    }));

  const holds = members.filter((m) => m.state === "holds").length;
  const done = members.every((m) => m.state !== "waiting");

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-center">
      <div className="relative mx-auto aspect-square w-full max-w-[380px]">
        <svg viewBox="-100 -100 200 200" className="h-full w-full" role="img" aria-label="Exposure radar">
          <defs>
            <radialGradient id="sweepGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(95)">
              <stop offset="0" stopColor="rgb(16,185,129)" stopOpacity="0.35" />
              <stop offset="1" stopColor="rgb(16,185,129)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {[30, 60, 90].map((r) => (
            <circle key={r} r={r} fill="none" stroke="rgba(255,255,255,0.08)" />
          ))}
          <line x1="-95" y1="0" x2="95" y2="0" stroke="rgba(255,255,255,0.05)" />
          <line x1="0" y1="-95" x2="0" y2="95" stroke="rgba(255,255,255,0.05)" />
          <g className="radar-sweep">
            <path d="M0 0 L95 0 A95 95 0 0 0 67 -67 Z" fill="url(#sweepGrad)" />
          </g>
          <circle r="5" fill="rgb(16,185,129)" />
          <circle r="5" fill="none" stroke="rgb(16,185,129)" className="pulse-ring" />
          {members.map((m) => {
            const a = (m.angle * Math.PI) / 180;
            const x = Math.cos(a) * m.distance * 90;
            const y = Math.sin(a) * m.distance * 90;
            const color =
              m.state === "holds" ? "rgb(245,158,11)" : m.state === "clear" ? "rgb(16,185,129)" : m.state === "silent" ? "rgb(239,68,68)" : "rgba(255,255,255,0.35)";
            return (
              <g key={m.label}>
                {m.state !== "waiting" ? <line x1="0" y1="0" x2={x} y2={y} stroke={color} strokeOpacity="0.35" strokeDasharray={m.state === "silent" ? "2 3" : undefined} /> : null}
                <circle cx={x} cy={y} r="4" fill={color} />
                {m.state === "holds" ? <circle cx={x} cy={y} r="4" fill="none" stroke={color} className="pulse-ring" /> : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.label} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
            <span className="font-mono text-[12px] text-white/70">{m.label}</span>
            <span
              className={`font-mono text-[11px] uppercase tracking-[0.12em] ${
                m.state === "holds" ? "text-amber-300" : m.state === "clear" ? "text-emerald-300" : m.state === "silent" ? "text-red-300" : "text-white/30"
              }`}
            >
              {m.state === "waiting" ? "asking…" : m.state === "silent" ? `silent · ${m.reason}` : `${m.state === "holds" ? "holds borrower" : "clear"} · ${m.ms}ms`}
            </span>
          </div>
        ))}
        <div className={`mt-3 rounded-lg border px-3.5 py-3 text-[13px] transition-colors ${done ? "border-amber-500/30 bg-amber-500/[0.07] text-amber-100" : "border-white/[0.07] text-white/40"}`}>
          {done
            ? `Held by ${holds} other lenders. One member was silent, so this is a floor, not a total: partial answers are never shown as clean.`
            : "Waiting for members to answer…"}
        </div>
        {!live ? <p className="pt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/25">Illustration · members unnamed · timings drawn</p> : null}
      </div>
    </div>
  );
}
