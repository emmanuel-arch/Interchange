"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatInTimeZone, getTimezoneOffset } from "date-fns-tz";
import { useRouter } from "next/navigation";
import {
  Shield, ShieldCheck, ShieldAlert,
  Lock, Unlock, Fingerprint,
  Server, Cpu, Wifi, Activity,
  KeyRound, Globe, Zap, Radio,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const NAIROBI_TZ = "Africa/Nairobi";
const PIN_LENGTH = 4;
const SCRUB_MIN = -720;
const SCRUB_MAX = 720;
const SCRUB_LINES = 97;
const MAGNET_RADIUS = 4;

const IDLE_TIMEOUT_MS = 20_000;       // 20s idle → show screenlock (dismissable)
const WARNING_DELAY_MS = 10_000;       // 10s on screenlock → warning countdown
const SHUTDOWN_COUNTDOWN_S = 10;       // 10s countdown before full lock

type Phase = "off" | "screensaver" | "warning" | "locked";

// ═══════════════════════════════════════════════════════════════════
// Trading Sessions (hours in EAT — East Africa Time, UTC+3)
// ═══════════════════════════════════════════════════════════════════

interface TradingSession {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  countryCode: string;
  tz: string;
  startEAT: number;
  endEAT: number;
  isGoldStrike: boolean;
}

const SESSIONS: TradingSession[] = [
  {
    id: "sydney",
    name: "SYDNEY SESSION",
    shortName: "SYDNEY",
    city: "Sydney",
    country: "Australia",
    countryCode: "au",
    tz: "Australia/Sydney",
    startEAT: 0,
    endEAT: 9,
    isGoldStrike: false,
  },
  {
    id: "tokyo",
    name: "TOKYO SESSION",
    shortName: "TOKYO",
    city: "Tokyo",
    country: "Japan",
    countryCode: "jp",
    tz: "Asia/Tokyo",
    startEAT: 2,
    endEAT: 11,
    isGoldStrike: false,
  },
  {
    id: "london",
    name: "LONDON SESSION",
    shortName: "LONDON",
    city: "London",
    country: "United Kingdom",
    countryCode: "gb",
    tz: "Europe/London",
    startEAT: 10,
    endEAT: 19,
    isGoldStrike: true,
  },
  {
    id: "newyork",
    name: "NEW YORK SESSION",
    shortName: "NEW YORK",
    city: "New York",
    country: "United States",
    countryCode: "us",
    tz: "America/New_York",
    startEAT: 15,
    endEAT: 24,
    isGoldStrike: true,
  },
];

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function getEATHour(date: Date): number {
  return parseInt(formatInTimeZone(date, NAIROBI_TZ, "H"), 10);
}

function isActive(s: TradingSession, eatHour: number): boolean {
  return eatHour >= s.startEAT && eatHour < s.endEAT;
}

function getSessionTriple(date: Date) {
  const eatHour = getEATHour(date);
  const eatMin = parseInt(formatInTimeZone(date, NAIROBI_TZ, "m"), 10);
  const eatMinutes = eatHour * 60 + eatMin;

  const activeSessions = SESSIONS.filter((s) => isActive(s, eatHour));
  const current =
    [...activeSessions].sort((a, b) => b.startEAT - a.startEAT)[0] ||
    SESSIONS[0];

  const idx = SESSIONS.findIndex((s) => s.id === current.id);
  const prev = SESSIONS[(idx - 1 + SESSIONS.length) % SESSIONS.length];
  const next = SESSIONS[(idx + 1) % SESSIONS.length];

  const prevIsActive = isActive(prev, eatHour);
  const nextIsActive = isActive(next, eatHour);

  let prevEndedAgo = eatMinutes - prev.endEAT * 60;
  if (prevEndedAgo < 0) prevEndedAgo += 24 * 60;

  let nextStartsIn = next.startEAT * 60 - eatMinutes;
  if (nextStartsIn < 0) nextStartsIn += 24 * 60;

  return {
    current,
    previous: { session: prev, isActive: prevIsActive, endedMinutesAgo: prevIsActive ? 0 : prevEndedAgo },
    next: { session: next, isActive: nextIsActive, startsInMinutes: nextIsActive ? 0 : nextStartsIn },
  };
}

function fmtTime(date: Date, tz: string, use24h: boolean): string {
  return formatInTimeZone(date, tz, use24h ? "HH:mm" : "hh:mm");
}
function fmtPeriod(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "a").toUpperCase();
}
function fmtSeconds(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "ss");
}

function getDelta(homeTz: string, targetTz: string, date: Date): number {
  const h = getTimezoneOffset(homeTz, date);
  const t = getTimezoneOffset(targetTz, date);
  return (t - h) / 3_600_000;
}

function getTimeGradient(tz: string, date: Date): string {
  const h = parseInt(formatInTimeZone(date, tz, "H"), 10);
  if (h < 5) return "from-indigo-950/30 via-slate-900/15 to-transparent";
  if (h < 7) return "from-amber-900/20 via-rose-900/10 to-transparent";
  if (h < 11) return "from-amber-400/10 via-yellow-200/5 to-transparent";
  if (h < 14) return "from-yellow-300/10 via-sky-200/5 to-transparent";
  if (h < 17) return "from-orange-300/8 via-amber-200/5 to-transparent";
  if (h < 19) return "from-orange-600/15 via-rose-500/10 to-transparent";
  if (h < 21) return "from-purple-900/20 via-indigo-900/10 to-transparent";
  return "from-slate-900/20 via-indigo-950/10 to-transparent";
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function randomHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("").toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export function TradingScreenLock({ mode = "idle" }: { mode?: "gate" | "idle" } = {}) {
  // "gate"  → public landing/front-door: starts locked, no idle/screensaver flow.
  // "idle"  → in-app overlay: kicks in after inactivity (the original behavior).
  const isGate = mode === "gate";
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(isGate ? "locked" : "off");
  const [countdown, setCountdown] = useState(SHUTDOWN_COUNTDOWN_S);
  const [now, setNow] = useState(new Date());
  const [scrubberMinutes, setScrubberMinutes] = useState(0);
  const [use24h, setUse24h] = useState(false);
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [activeDigit, setActiveDigit] = useState(0);
  const [authState, setAuthState] = useState<"idle" | "authenticating" | "success" | "denied">("idle");
  const [hexStream, setHexStream] = useState(randomHex(32));
  // Gate SSR vs client: time + random values only exist client-side, so we
  // render a deterministic shell on the server and hydrate the live UI on mount.
  const [mounted, setMounted] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const authStateRef = useRef(authState);
  const phaseRef = useRef(phase);

  authStateRef.current = authState;
  phaseRef.current = phase;

  const isVisible = phase !== "off";
  const isLocked = phase === "locked";

  // ── Clear all timers helper ──
  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  // ── Reset to idle (restart 20s timer) ──
  const resetToIdle = useCallback(() => {
    clearAllTimers();
    setPhase("off");
    setCountdown(SHUTDOWN_COUNTDOWN_S);
    setPin(["", "", "", ""]);
    setActiveDigit(0);
    setAuthState("idle");
    setScrubberMinutes(0);
    idleTimerRef.current = setTimeout(() => setPhase("screensaver"), IDLE_TIMEOUT_MS);
  }, [clearAllTimers]);

  // ── Start warning timer when screensaver phase begins ──
  useEffect(() => {
    if (phase === "screensaver") {
      warningTimerRef.current = setTimeout(() => {
        setPhase("warning");
        setCountdown(SHUTDOWN_COUNTDOWN_S);
      }, WARNING_DELAY_MS);
    }
    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [phase]);

  // ── Countdown when warning phase ──
  useEffect(() => {
    if (phase === "warning") {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            setPhase("locked");
            return SHUTDOWN_COUNTDOWN_S;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [phase]);

  // ── Mark mounted (client only) ──
  useEffect(() => setMounted(true), []);

  // ── Idle Timer ──
  // Start on mount (idle mode only — the gate stays locked, never idles out).
  useEffect(() => {
    if (isGate) return;
    idleTimerRef.current = setTimeout(() => setPhase("screensaver"), IDLE_TIMEOUT_MS);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isGate]);

  // ── Authentication ──
  const failAndReset = useCallback(() => {
    setAuthState("denied");
    setTimeout(() => {
      setPin(["", "", "", ""]);
      setActiveDigit(0);
      setAuthState("idle");
      setTimeout(() => pinRefs.current[0]?.focus(), 0);
    }, 1200);
  }, []);

  const handleAuthenticate = useCallback(async () => {
    if (authStateRef.current !== "idle") return;
    const pinStr = pin.join("");
    if (pinStr.length < PIN_LENGTH) return;
    setAuthState("authenticating");
    try {
      const res = await fetch("/api/auth/access-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pinStr }),
      });
      if (res.ok) {
        setAuthState("success");
        setTimeout(() => {
          if (isGate) {
            // Front door → into the cockpit.
            router.replace("/dashboard");
            router.refresh();
          } else {
            // In-app overlay → just dismiss and resume the session.
            resetToIdle();
          }
        }, 1200);
      } else {
        failAndReset();
      }
    } catch {
      failAndReset();
    }
  }, [pin, resetToIdle, isGate, router, failAndReset]);

  // ── Auto-authenticate when all 4 digits entered ──
  useEffect(() => {
    const pinStr = pin.join("");
    if (pinStr.length === PIN_LENGTH && authState === "idle" && phase === "locked") {
      handleAuthenticate();
    }
  }, [pin, authState, handleAuthenticate, phase]);

  // ── Activity Listeners ──
  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    const handleActivity = (e: Event) => {
      const currentPhase = phaseRef.current;

      if (currentPhase === "off") {
        // Reset idle timer on any activity
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => setPhase("screensaver"), IDLE_TIMEOUT_MS);
        return;
      }

      if (currentPhase === "screensaver") {
        // Dismiss — go back to off
        resetToIdle();
        return;
      }

      // In warning or locked phase, only handle keyboard for PIN
      if (currentPhase === "locked" && e.type === "keydown" && authStateRef.current === "idle") {
        const ke = e as KeyboardEvent;
        if (ke.key === "Enter") {
          handleAuthenticate();
        } else if (ke.key === "Backspace") {
          setPin((prev) => {
            const newPin = [...prev];
            for (let i = PIN_LENGTH - 1; i >= 0; i--) {
              if (newPin[i] !== "") {
                newPin[i] = "";
                setActiveDigit(i);
                setTimeout(() => pinRefs.current[i]?.focus(), 0);
                break;
              }
            }
            return newPin;
          });
        } else if (/^\d$/.test(ke.key)) {
          setPin((prev) => {
            const newPin = [...prev];
            const emptyIdx = newPin.findIndex((d) => d === "");
            if (emptyIdx !== -1) {
              newPin[emptyIdx] = ke.key;
              const nextIdx = Math.min(emptyIdx + 1, PIN_LENGTH - 1);
              setActiveDigit(nextIdx);
              setTimeout(() => pinRefs.current[nextIdx]?.focus(), 0);
            }
            return newPin;
          });
        }
      }
    };
    events.forEach((ev) => window.addEventListener(ev, handleActivity, true));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity, true));
    };
  }, [resetToIdle, handleAuthenticate]);

  // ── Clock Ticking ──
  useEffect(() => {
    if (isVisible) {
      setNow(new Date());
      intervalRef.current = setInterval(() => setNow(new Date()), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isVisible]);

  // ── Hex Stream ──
  useEffect(() => {
    if (!isVisible) return;
    const id = setInterval(() => setHexStream(randomHex(32)), 150);
    return () => clearInterval(id);
  }, [isVisible]);

  // ── Auto-focus PIN input ──
  useEffect(() => {
    if (phase === "locked") {
      const id = setTimeout(() => pinRefs.current[0]?.focus(), isGate ? 500 : 1600);
      return () => clearTimeout(id);
    }
  }, [phase, isGate]);

  // ── Computed time ──
  const isScrubbing = scrubberMinutes !== 0;
  const baseTime = isScrubbing
    ? new Date(Math.round(now.getTime() / (30 * 60_000)) * (30 * 60_000))
    : now;
  const displayTime = new Date(baseTime.getTime() + scrubberMinutes * 60_000);
  const displayTimeMs = displayTime.getTime();

  const sessionInfo = useMemo(() => getSessionTriple(displayTime), [displayTimeMs]);

  // ── Session data for display ──
  const { current, previous, next } = sessionInfo;
  const nairobiTime = fmtTime(displayTime, NAIROBI_TZ, use24h);
  const nairobiPeriod = use24h ? "" : fmtPeriod(displayTime, NAIROBI_TZ);
  const nairobiSecs = fmtSeconds(displayTime, NAIROBI_TZ);
  const centerGradient = getTimeGradient(NAIROBI_TZ, displayTime);

  const offsetHours = scrubberMinutes / 60;
  const scrubSign = offsetHours >= 0 ? "+" : "";

  // Until mounted, emit a deterministic shell so server and client HTML match.
  // Gate mode shows a static black front-door; idle mode renders nothing.
  if (!mounted) {
    return isGate ? (
      <div className="fixed inset-0 z-[9999] bg-[#030303]" aria-hidden />
    ) : null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="screenlock"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, delay: 0.1 } }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] bg-[#030303] flex flex-col select-none overflow-hidden"
        >
          {/* ── Background Grid ── */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.025]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />

          {/* ── Scanning Line ── */}
          <motion.div
            className="absolute left-0 right-0 h-px pointer-events-none z-20"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(251,191,36,0.12), transparent)",
            }}
            animate={{ top: ["0%", "100%"] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />

          {/* ── Matrix Hex Columns ── */}
          <div className="absolute left-1.5 top-14 bottom-14 w-5 overflow-hidden pointer-events-none opacity-[0.03]">
            <motion.div
              className="font-mono text-[5px] text-emerald-300 leading-[7px] break-all whitespace-pre-wrap"
              animate={{ y: ["0%", "-50%"] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
              {randomHex(600)}
            </motion.div>
          </div>
          <div className="absolute right-1.5 top-14 bottom-14 w-5 overflow-hidden pointer-events-none opacity-[0.03]">
            <motion.div
              className="font-mono text-[5px] text-emerald-300 leading-[7px] break-all whitespace-pre-wrap"
              animate={{ y: ["-50%", "0%"] }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            >
              {randomHex(600)}
            </motion.div>
          </div>

          {/* ═══ Top Security Bar ═══ */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="flex items-center justify-between px-4 sm:px-8 py-3 border-b border-white/[0.04] relative z-10 shrink-0"
          >
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, repeatDelay: 6 }}
              >
                <Shield className="w-4 h-4 text-amber-500/70" />
              </motion.div>
              <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/25">
                GoldStrike Secure Lock
              </span>
              <span className="font-mono text-[7px] text-white/8 hidden md:inline tracking-wider">
                {hexStream}
              </span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Single-owner access: 4-digit code only (no login/register). */}
              <div className="hidden md:flex items-center gap-3 sm:gap-4">
              {[
                { icon: Lock, label: "AES-256" },
                { icon: Wifi, label: "TLS 1.3" },
                { icon: Server, label: "VAULT" },
                { icon: Cpu, label: "ENCLAVE" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-emerald-500/60 animate-pulse" />
                  <Icon className="w-3 h-3 text-emerald-500/40" />
                  <span className="font-mono text-[7px] uppercase tracking-wider text-white/15 hidden sm:inline">
                    {label}
                  </span>
                </div>
              ))}
              </div>
            </div>
          </motion.div>

          {/* ═══ Main Content ═══ */}
          <div className="flex-1 flex flex-col relative z-10 min-h-0">
            {/* ── Previous Session Row ── */}
            <SessionRow
              session={previous.session}
              displayTime={displayTime}
              use24h={use24h}
              homeTz={NAIROBI_TZ}
              status={
                previous.isActive
                  ? { label: "SESSION WINDING DOWN", color: "text-amber-400/60" }
                  : {
                      label: `ENDED ${formatDuration(previous.endedMinutesAgo)} AGO`,
                      color: "text-white/15",
                    }
              }
              position="top"
              index={0}
            />

            {/* ── Center: Kenya + Vault ── */}
            <motion.div
              initial={{ opacity: 0, x: -300, filter: "blur(12px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{
                duration: 0.8,
                delay: 0.4,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className={`flex-[2.5] flex flex-col items-center justify-center px-4 sm:px-8 relative overflow-hidden bg-gradient-to-r ${centerGradient} border-l-2 border-l-amber-500/40`}
            >
              <div className="absolute top-0 left-4 right-4 sm:left-8 sm:right-8 h-px bg-white/[0.04]" />

              {/* Kenya Header Row */}
              <div className="flex items-center gap-4 sm:gap-6 mb-1 w-full max-w-2xl">
                <span
                  className="fi fi-ke rounded shadow-lg shadow-black/30"
                  style={{
                    fontSize: "clamp(2.5rem, 6vw, 5rem)",
                    lineHeight: 1,
                  }}
                />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div
                    className="font-mono font-bold text-white/90 tracking-wider uppercase leading-none"
                    style={{ fontSize: "clamp(20px, 4vw, 44px)" }}
                  >
                    NAIROBI
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-mono text-white/25 uppercase tracking-[0.2em]"
                      style={{ fontSize: "clamp(8px, 1.2vw, 13px)" }}
                    >
                      Kenya
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-500/50 border border-amber-500/15 px-1.5 py-0.5 rounded-sm">
                      home
                    </span>
                  </div>
                </div>

                {/* Time display */}
                <div className="flex items-baseline gap-1 sm:gap-2 ml-auto shrink-0">
                  <div
                    className="font-mono font-bold text-white/90 tabular-nums tracking-wider"
                    style={{
                      fontSize: "clamp(30px, 6vw, 72px)",
                      lineHeight: 1,
                    }}
                  >
                    {nairobiTime}
                  </div>
                  <div className="flex flex-col items-start">
                    {nairobiPeriod && (
                      <span
                        className="font-mono font-bold text-white/20 tracking-wider"
                        style={{
                          fontSize: "clamp(10px, 1.5vw, 18px)",
                          lineHeight: 1.3,
                        }}
                      >
                        {nairobiPeriod}
                      </span>
                    )}
                    <span
                      className="font-mono tabular-nums text-white/10 tracking-wider"
                      style={{
                        fontSize: "clamp(9px, 1.2vw, 14px)",
                        lineHeight: 1.3,
                      }}
                    >
                      :{nairobiSecs}
                    </span>
                  </div>
                </div>
              </div>

              {/* Current Session + Engine Status */}
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={`fi fi-${current.countryCode} rounded`}
                  style={{ fontSize: "1.2rem" }}
                />
                <span className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/35">
                  {current.name}
                </span>
                <span className="text-white/10">·</span>
                {current.isGoldStrike ? (
                  <span className="flex items-center gap-1.5">
                    <motion.div
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Zap className="w-3 h-3 text-emerald-400" />
                    </motion.div>
                    <span className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.15em] text-emerald-400">
                      GoldStrike Engine Online
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-white/20" />
                    <span className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.15em] text-white/20">
                      Engine Offline
                    </span>
                  </span>
                )}
              </div>

              {/* ── Vault PIN Section (only when locked) ── */}
              <AnimatePresence>
                {phase === "locked" && (
                  <motion.div
                    key="vault-pin"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4 }}
                  >
                    <VaultPinInput
                      pin={pin}
                      setPin={setPin}
                      activeDigit={activeDigit}
                      setActiveDigit={setActiveDigit}
                      authState={authState}
                      onAuthenticate={handleAuthenticate}
                      pinRefs={pinRefs}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Warning Countdown Overlay ── */}
              <AnimatePresence>
                {phase === "warning" && (
                  <motion.div
                    key="warning-overlay"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4 }}
                    className="w-full max-w-sm"
                  >
                    <div className="relative border border-amber-500/20 rounded-lg px-5 py-5 bg-amber-950/10 backdrop-blur-sm text-center">
                      {/* Corner Brackets */}
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-500/30 rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-500/30 rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-500/30 rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-500/30 rounded-br-lg" />

                      {/* Scanning line */}
                      <motion.div
                        className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent z-20 rounded-full"
                        animate={{ top: ["10%", "90%", "10%"] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      />

                      <motion.div
                        animate={{ rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <ShieldAlert className="w-8 h-8 text-amber-500/70 mx-auto mb-3" />
                      </motion.div>

                      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-500/60 mb-2">
                        Temporary Shutdown Imminent
                      </div>

                      {/* Countdown ring */}
                      <div className="relative w-20 h-20 mx-auto mb-3">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle
                            cx="50" cy="50" r="42"
                            fill="none"
                            stroke="rgba(251,191,36,0.1)"
                            strokeWidth="3"
                          />
                          <motion.circle
                            cx="50" cy="50" r="42"
                            fill="none"
                            stroke="rgba(251,191,36,0.6)"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 42}
                            strokeDashoffset={2 * Math.PI * 42 * (1 - countdown / SHUTDOWN_COUNTDOWN_S)}
                            transition={{ duration: 0.5 }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="font-mono text-3xl font-bold text-amber-400/80 tabular-nums">
                            {countdown}
                          </span>
                        </div>
                      </div>

                      <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/15">
                        Session will lock in {countdown} second{countdown !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Screensaver hint ── */}
              <AnimatePresence>
                {phase === "screensaver" && (
                  <motion.div
                    key="screensaver-hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 1, duration: 0.5 }}
                    className="mt-6 flex items-center gap-2"
                  >
                    <motion.div
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Activity className="w-3 h-3 text-white/15" />
                    </motion.div>
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/15">
                      Move mouse or press any key to dismiss
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ── Next Session Row ── */}
            <SessionRow
              session={next.session}
              displayTime={displayTime}
              use24h={use24h}
              homeTz={NAIROBI_TZ}
              status={
                next.isActive
                  ? { label: "IN PROGRESS", color: "text-emerald-400/60" }
                  : {
                      label: `UP NEXT · IN ${formatDuration(next.startsInMinutes)}`,
                      color: "text-white/20",
                    }
              }
              position="bottom"
              index={2}
            />
          </div>

          {/* ═══ Time Scrubber ═══ */}
          <LockTimeScrubber
            scrubberMinutes={scrubberMinutes}
            setScrubberMinutes={setScrubberMinutes}
            isScrubbing={isScrubbing}
            resetScrubber={() => setScrubberMinutes(0)}
            use24h={use24h}
            toggleTimeFormat={() => setUse24h((p) => !p)}
            offsetHours={offsetHours}
            scrubSign={scrubSign}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Session Row
// ═══════════════════════════════════════════════════════════════════

function SessionRow({
  session,
  displayTime,
  use24h,
  homeTz,
  status,
  position,
  index,
}: {
  session: TradingSession;
  displayTime: Date;
  use24h: boolean;
  homeTz: string;
  status: { label: string; color: string };
  position: "top" | "bottom";
  index: number;
}) {
  const time = fmtTime(displayTime, session.tz, use24h);
  const period = use24h ? "" : fmtPeriod(displayTime, session.tz);
  const secs = fmtSeconds(displayTime, session.tz);
  const delta = getDelta(homeTz, session.tz, displayTime);
  const deltaSign = delta > 0 ? "+" : "";
  const deltaStr = delta !== 0 ? `${deltaSign}${delta}h` : "";
  const gradient = getTimeGradient(session.tz, displayTime);

  return (
    <motion.div
      initial={{ opacity: 0, x: -300, filter: "blur(12px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={{
        duration: 0.8,
        delay: 0.15 + index * 0.25,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={`flex items-center justify-between px-4 sm:px-8 lg:px-14 py-2 flex-1 min-h-0 overflow-hidden relative bg-gradient-to-r ${gradient} border-l-2 border-l-transparent`}
    >
      {position === "bottom" && (
        <div className="absolute top-0 left-4 right-4 sm:left-8 sm:right-8 h-px bg-white/[0.04]" />
      )}

      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
        <span
          className={`fi fi-${session.countryCode} rounded shadow-lg shadow-black/30`}
          style={{
            fontSize: "clamp(2rem, 4vw, 3.5rem)",
            lineHeight: 1,
          }}
        />
        <div className="min-w-0 flex flex-col gap-0.5">
          <div
            className="font-mono font-bold text-white/50 tracking-wider uppercase leading-none truncate"
            style={{ fontSize: "clamp(14px, 3vw, 32px)" }}
          >
            {session.city}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-mono text-white/15 uppercase tracking-[0.2em] truncate"
              style={{ fontSize: "clamp(7px, 1vw, 11px)" }}
            >
              {session.country}
            </span>
            {deltaStr && (
              <span
                className={`font-mono font-bold tracking-wider ${
                  delta > 0
                    ? "text-emerald-400/40"
                    : "text-red-400/40"
                }`}
                style={{ fontSize: "clamp(10px, 1.5vw, 16px)" }}
              >
                {deltaStr}
              </span>
            )}
          </div>
          <span
            className={`font-mono uppercase tracking-[0.2em] ${status.color}`}
            style={{ fontSize: "clamp(7px, 0.9vw, 10px)" }}
          >
            {status.label}
          </span>
          {session.isGoldStrike && (
            <span className="flex items-center gap-1 mt-0.5">
              <Zap className="w-2.5 h-2.5 text-amber-500/30" />
              <span className="font-mono text-[7px] sm:text-[8px] uppercase tracking-[0.15em] text-amber-500/25">
                GoldStrike Session
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-1 shrink-0">
        <div
          className="font-mono font-bold text-white/40 tabular-nums tracking-wider"
          style={{
            fontSize: "clamp(24px, 5vw, 56px)",
            lineHeight: 1,
          }}
        >
          {time}
        </div>
        <div className="flex flex-col items-start">
          {period && (
            <span
              className="font-mono font-bold text-white/12 tracking-wider"
              style={{ fontSize: "clamp(8px, 1vw, 14px)", lineHeight: 1.3 }}
            >
              {period}
            </span>
          )}
          <span
            className="font-mono tabular-nums text-white/6 tracking-wider"
            style={{
              fontSize: "clamp(7px, 0.9vw, 12px)",
              lineHeight: 1.3,
            }}
          >
            :{secs}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Vault PIN Input
// ═══════════════════════════════════════════════════════════════════

function VaultPinInput({
  pin,
  setPin,
  activeDigit,
  setActiveDigit,
  authState,
  onAuthenticate,
  pinRefs,
}: {
  pin: string[];
  setPin: (fn: (prev: string[]) => string[]) => void;
  activeDigit: number;
  setActiveDigit: (n: number) => void;
  authState: "idle" | "authenticating" | "success" | "denied";
  onAuthenticate: () => void;
  pinRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
}) {
  const handleDigitChange = (index: number, value: string) => {
    if (authState !== "idle") return;
    if (!/^\d?$/.test(value)) return;

    setPin((prev) => {
      const newPin = [...prev];
      newPin[index] = value;
      return newPin;
    });

    if (value && index < PIN_LENGTH - 1) {
      setActiveDigit(index + 1);
      setTimeout(() => pinRefs.current[index + 1]?.focus(), 0);
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (authState !== "idle") return;
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      setActiveDigit(index - 1);
      setPin((prev) => {
        const newPin = [...prev];
        newPin[index - 1] = "";
        return newPin;
      });
      setTimeout(() => pinRefs.current[index - 1]?.focus(), 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onAuthenticate();
    }
  };

  const filledCount = pin.filter((d) => d !== "").length;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 1.2, duration: 0.6 }}
      className="w-full max-w-sm relative"
    >
      {/* Vault Container */}
      <div
        className={`relative border rounded-lg px-5 py-5 backdrop-blur-sm transition-all duration-500 ${
          authState === "success"
            ? "border-emerald-500/30 bg-emerald-950/20 shadow-[0_0_40px_rgba(16,185,129,0.08)]"
            : authState === "denied"
              ? "border-red-500/30 bg-red-950/20 shadow-[0_0_40px_rgba(239,68,68,0.08)]"
              : authState === "authenticating"
                ? "border-amber-500/20 bg-amber-950/10 shadow-[0_0_30px_rgba(251,191,36,0.05)]"
                : filledCount > 0
                  ? "border-amber-500/15 bg-white/[0.02] shadow-[0_0_20px_rgba(251,191,36,0.03)]"
                  : "border-white/[0.06] bg-white/[0.01]"
        }`}
      >
        {/* Corner Brackets */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-500/15 rounded-tl-lg" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-500/15 rounded-tr-lg" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-500/15 rounded-bl-lg" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-500/15 rounded-br-lg" />

        {/* Auth scanning line */}
        {authState === "authenticating" && (
          <motion.div
            className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent z-20 rounded-full"
            animate={{ top: ["10%", "90%", "10%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* Shield Icon */}
        <div className="flex justify-center mb-3">
          <div
            className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${
              authState === "success"
                ? "bg-emerald-500/10 border-2 border-emerald-500/30"
                : authState === "denied"
                  ? "bg-red-500/10 border-2 border-red-500/30"
                  : authState === "authenticating"
                    ? "bg-amber-500/5 border-2 border-amber-500/20"
                    : "bg-white/[0.02] border-2 border-white/[0.06]"
            }`}
          >
            {authState === "authenticating" && (
              <motion.div
                className="absolute inset-[-2px] rounded-full border-2 border-transparent border-t-amber-500/50 border-r-amber-500/20"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            )}

            {filledCount > 0 && authState === "idle" && (
              <motion.div
                className="absolute inset-[-4px] rounded-full border border-amber-500/15"
                animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}

            {authState === "success" && (
              <motion.div
                className="absolute inset-[-6px] rounded-full border-2 border-emerald-400/30"
                initial={{ scale: 0.8, opacity: 1 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 0.8 }}
              />
            )}

            <AnimatePresence mode="wait">
              {authState === "success" ? (
                <motion.div
                  key="unlock"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                >
                  <Unlock className="w-5 h-5 text-emerald-400" />
                </motion.div>
              ) : authState === "denied" ? (
                <motion.div
                  key="denied"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, x: [0, -6, 6, -4, 4, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                </motion.div>
              ) : authState === "authenticating" ? (
                <motion.div
                  key="scan"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
                  <Fingerprint className="w-5 h-5 text-amber-400" />
                </motion.div>
              ) : (
                <motion.div
                  key="lock"
                  animate={
                    filledCount > 0
                      ? { y: [0, -2, 0] }
                      : { opacity: [0.3, 0.5, 0.3] }
                  }
                  transition={{
                    duration: filledCount > 0 ? 0.4 : 3,
                    repeat: Infinity,
                  }}
                >
                  <Lock className="w-5 h-5 text-white/30" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Header Text */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <AnimatePresence mode="wait">
            {authState === "success" ? (
              <motion.div
                key="s"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-400">
                  Access Granted — Session Restored
                </span>
              </motion.div>
            ) : authState === "denied" ? (
              <motion.div
                key="d"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  x: [0, -8, 8, -4, 4, 0],
                }}
                className="flex items-center gap-2"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-400">
                  Invalid Access Code
                </span>
              </motion.div>
            ) : authState === "authenticating" ? (
              <motion.div key="a" className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                >
                  <Fingerprint className="w-3.5 h-3.5 text-amber-400" />
                </motion.div>
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-400">
                  Verifying Access Code
                </span>
                <motion.span
                  className="font-mono text-[10px] text-amber-400"
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                >
                  ...
                </motion.span>
              </motion.div>
            ) : (
              <motion.div key="i" className="flex items-center gap-2">
                <KeyRound className="w-3 h-3 text-white/20" />
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/20">
                  Enter Your 4-Digit Access Code
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* PIN Input Row */}
        <div className="flex items-center justify-center gap-3 mb-4">
          {pin.map((digit, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4 + i * 0.1 }}
              className="relative"
            >
              <input
                ref={(el) => { pinRefs.current[i] = el; }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleDigitKeyDown(i, e)}
                onFocus={() => setActiveDigit(i)}
                disabled={authState !== "idle"}
                className={`w-14 h-16 text-center font-mono text-2xl font-bold bg-transparent border-2 rounded-lg outline-none transition-all duration-300 ${
                  authState === "success"
                    ? "border-emerald-500/30 text-emerald-400"
                    : authState === "denied"
                      ? "border-red-500/30 text-red-400"
                      : authState === "authenticating"
                        ? "border-amber-500/20 text-amber-400"
                        : digit
                          ? "border-amber-500/25 text-white/80"
                          : activeDigit === i
                            ? "border-white/15 text-white/80"
                            : "border-white/[0.06] text-white/80"
                }`}
                autoComplete="off"
              />
              {/* Active digit indicator */}
              {activeDigit === i && authState === "idle" && !digit && (
                <motion.div
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-amber-500/40 rounded-full"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
              {/* Filled indicator dot */}
              {digit && authState === "idle" && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500/50"
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Hint */}
        <div className="flex items-center justify-center gap-1.5 mb-3 h-3">
          {authState === "idle" && filledCount === 0 && (
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/10">
              type your pin to continue your session
            </span>
          )}
          {authState === "idle" && filledCount > 0 && filledCount < PIN_LENGTH && (
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/10">
              {PIN_LENGTH - filledCount} digit{PIN_LENGTH - filledCount > 1 ? "s" : ""} remaining
            </span>
          )}
        </div>

        {/* Security Footer */}
        <div className="flex items-center justify-center gap-4 mt-2">
          {[
            { icon: Lock, label: "SESSION PRESERVED" },
            { icon: Globe, label: "ENCRYPTED" },
            { icon: Radio, label: "SECURE CHANNEL" },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1">
              <Icon className="w-2.5 h-2.5 text-white/10" />
              <span className="font-mono text-[6px] uppercase tracking-wider text-white/8">
                {label}
              </span>
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Time Scrubber
// ═══════════════════════════════════════════════════════════════════

function LockTimeScrubber({
  scrubberMinutes,
  setScrubberMinutes,
  isScrubbing,
  resetScrubber,
  use24h,
  toggleTimeFormat,
  offsetHours,
  scrubSign,
}: {
  scrubberMinutes: number;
  setScrubberMinutes: (v: number) => void;
  isScrubbing: boolean;
  resetScrubber: () => void;
  use24h: boolean;
  toggleTimeFormat: () => void;
  offsetHours: number;
  scrubSign: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [hoverLineIndex, setHoverLineIndex] = useState<number | null>(null);
  const [isHovering, setIsHovering] = useState(false);

  const progress = (scrubberMinutes - SCRUB_MIN) / (SCRUB_MAX - SCRUB_MIN);

  function getMinutesFromPointer(clientX: number) {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width)
    );
    const raw = SCRUB_MIN + ratio * (SCRUB_MAX - SCRUB_MIN);
    return Math.round(raw / 30) * 30;
  }

  function getLineIndex(clientX: number) {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width)
    );
    return ratio * (SCRUB_LINES - 1);
  }

  function handlePointerDown(e: React.PointerEvent) {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setScrubberMinutes(getMinutesFromPointer(e.clientX));
    setHoverLineIndex(getLineIndex(e.clientX));
    setIsHovering(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    setHoverLineIndex(getLineIndex(e.clientX));
    setIsHovering(true);
    if (isDragging.current) {
      setScrubberMinutes(getMinutesFromPointer(e.clientX));
    }
  }

  function handlePointerUp() {
    isDragging.current = false;
  }

  function handlePointerLeave() {
    if (!isDragging.current) {
      setHoverLineIndex(null);
      setIsHovering(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.5, duration: 0.6 }}
      className="border-t border-white/[0.04] px-4 sm:px-8 py-3 sm:py-4 relative z-10 shrink-0"
    >
      {/* Labels Row */}
      <div className="relative flex items-center justify-between mb-2 h-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20 hidden sm:inline">
            time travel
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTimeFormat();
            }}
            className="font-mono text-[9px] uppercase tracking-[0.2em] border px-2 py-0.5 text-white/20 border-white/[0.06] hover:text-white/40 hover:border-white/10 transition-colors"
          >
            {use24h ? "24H" : "AM/PM"}
          </button>
        </div>

        <span className="absolute left-1/2 -translate-x-1/2 font-mono text-xs text-white/60 uppercase tracking-wider">
          {isScrubbing
            ? `${scrubSign}${offsetHours.toFixed(
                offsetHours % 1 === 0 ? 0 : 1
              )}H`
            : "NOW"}
        </span>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              resetScrubber();
            }}
            className={`font-mono text-[9px] uppercase tracking-[0.2em] border px-2 py-0.5 transition-colors ${
              isScrubbing
                ? "text-white/20 border-white/[0.06] hover:text-white/40 hover:border-white/10"
                : "text-transparent border-transparent pointer-events-none"
            }`}
          >
            reset
          </button>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20 hidden sm:inline">
            drag to scrub
          </span>
        </div>
      </div>

      {/* Scrubber Track */}
      <div
        ref={containerRef}
        className="relative h-10 cursor-ew-resize select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={(e) => {
          e.stopPropagation();
          resetScrubber();
        }}
      >
        {/* Thumb */}
        <div
          className="absolute top-0 pointer-events-none z-20"
          style={{
            left: `${progress * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div
            className="bg-white/80 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)] transition-all duration-200"
            style={{
              width: isHovering ? "5px" : "3px",
              height: isHovering ? "48px" : "40px",
            }}
          />
        </div>

        {/* Lines */}
        <div className="absolute inset-0 flex items-end justify-between z-10">
          {Array.from({ length: SCRUB_LINES }).map((_, i) => {
            const isMajor = i % 12 === 0;
            const isMid = i % 6 === 0 && !isMajor;
            const baseH = isMajor ? 20 : isMid ? 14 : 8;

            let magnet = 0;
            if (hoverLineIndex !== null) {
              const dist = Math.abs(i - hoverLineIndex);
              if (dist < MAGNET_RADIUS) {
                magnet = 1 - dist / MAGNET_RADIUS;
                magnet *= magnet;
              }
            }

            const h = baseH + magnet * (36 - baseH);
            const opacity = 0.06 + magnet * 0.5;

            return (
              <div key={i} style={{ width: "1px" }}>
                <div
                  style={{
                    width: "1px",
                    height: `${h}px`,
                    background: `rgba(255,255,255,${opacity})`,
                    transition:
                      "height 0.2s cubic-bezier(0.25,0.46,0.45,0.94), background 0.15s ease",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Center Marker */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="w-px h-3 bg-white/15" />
        </div>
      </div>
    </motion.div>
  );
}
