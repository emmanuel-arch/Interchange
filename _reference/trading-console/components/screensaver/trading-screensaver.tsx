"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatInTimeZone, getTimezoneOffset } from "date-fns-tz";
import {
  Shield, ShieldAlert, Lock,
  AlertTriangle, Zap, Skull,
} from "lucide-react";

interface TradingZone {
  id: string;
  label: string;
  sublabel: string;
  countryCode: string;
  tz: string;
  isHome?: boolean;
}

const TRADING_ZONES: TradingZone[] = [
  {
    id: "nairobi",
    label: "Nairobi",
    sublabel: "Kenya",
    countryCode: "ke",
    tz: "Africa/Nairobi",
    isHome: true,
  },
  {
    id: "london",
    label: "London",
    sublabel: "United Kingdom",
    countryCode: "gb",
    tz: "Europe/London",
  },
  {
    id: "newyork",
    label: "New York",
    sublabel: "United States",
    countryCode: "us",
    tz: "America/New_York",
  },
];

const SCREENSAVER_IDLE_MS = 20_000; // 20 seconds idle → screensaver
const WARNING_DELAY_MS = 10_000; // 10 seconds on screensaver → warning countdown
const SHUTDOWN_COUNTDOWN_S = 10; // 10 second countdown before lock

function formatTime(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "hh:mm");
}

function formatPeriod(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "a").toUpperCase();
}

function formatSeconds(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "ss");
}

function getDeltaHours(
  homeTz: string,
  targetTz: string,
  date: Date
): number {
  const homeOffset = getTimezoneOffset(homeTz, date);
  const targetOffset = getTimezoneOffset(targetTz, date);
  return (targetOffset - homeOffset) / (60 * 60 * 1000);
}

function getSessionStatus(
  tz: string,
  date: Date
): { label: string; color: string } {
  const hour = parseInt(formatInTimeZone(date, tz, "H"), 10);

  if (tz === "America/New_York") {
    if (hour >= 9 && hour < 16)
      return { label: "NYSE OPEN", color: "text-emerald-400" };
    if (hour >= 8 && hour < 9)
      return { label: "PRE-MARKET", color: "text-amber-400" };
    if (hour >= 16 && hour < 20)
      return { label: "AFTER-HOURS", color: "text-amber-400/70" };
    return { label: "MARKET CLOSED", color: "text-white/20" };
  }

  if (tz === "Europe/London") {
    if (hour >= 8 && hour < 16)
      return { label: "LSE OPEN", color: "text-emerald-400" };
    if (hour >= 7 && hour < 8)
      return { label: "PRE-MARKET", color: "text-amber-400" };
    return { label: "MARKET CLOSED", color: "text-white/20" };
  }

  // Nairobi Stock Exchange
  if (hour >= 9 && hour < 15)
    return { label: "NSE OPEN", color: "text-emerald-400" };
  if (hour >= 15 && hour < 16)
    return { label: "CLOSING", color: "text-amber-400" };
  return { label: "NSE CLOSED", color: "text-white/20" };
}

function getTimeOfDayGradient(tz: string, date: Date): string {
  const hour = parseInt(formatInTimeZone(date, tz, "H"), 10);
  if (hour >= 0 && hour < 5) return "from-indigo-950/30 via-slate-900/15 to-transparent";
  if (hour >= 5 && hour < 7) return "from-amber-900/20 via-rose-900/10 to-transparent";
  if (hour >= 7 && hour < 11) return "from-amber-400/10 via-yellow-200/5 to-transparent";
  if (hour >= 11 && hour < 14) return "from-yellow-300/10 via-sky-200/5 to-transparent";
  if (hour >= 14 && hour < 17) return "from-orange-300/8 via-amber-200/5 to-transparent";
  if (hour >= 17 && hour < 19) return "from-orange-600/15 via-rose-500/10 to-transparent";
  if (hour >= 19 && hour < 21) return "from-purple-900/20 via-indigo-900/10 to-transparent";
  return "from-slate-900/20 via-indigo-950/10 to-transparent";
}

export function TradingScreensaver({ onLockTriggered }: { onLockTriggered?: () => void }) {
  const [isActive, setIsActive] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(SHUTDOWN_COUNTDOWN_S);
  const [now, setNow] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissingRef = useRef(false);
  const lockedRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    clearAllTimers();
    lockedRef.current = false;
    timerRef.current = setTimeout(() => setIsActive(true), SCREENSAVER_IDLE_MS);
  }, [clearAllTimers]);

  const dismiss = useCallback(() => {
    if (dismissingRef.current || showWarning) return;
    dismissingRef.current = true;
    setIsActive(false);
    setShowWarning(false);
    setCountdown(SHUTDOWN_COUNTDOWN_S);
    clearAllTimers();
    resetTimer();
    setTimeout(() => {
      dismissingRef.current = false;
    }, 500);
  }, [resetTimer, showWarning, clearAllTimers]);

  // Start warning timer when screensaver becomes active
  useEffect(() => {
    if (isActive && !showWarning && !lockedRef.current) {
      warningTimerRef.current = setTimeout(() => {
        setShowWarning(true);
        setCountdown(SHUTDOWN_COUNTDOWN_S);
      }, WARNING_DELAY_MS);
    }
    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [isActive, showWarning]);

  // Countdown when warning is showing
  useEffect(() => {
    if (showWarning && countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Trigger lock
            lockedRef.current = true;
            setIsActive(false);
            setShowWarning(false);
            setCountdown(SHUTDOWN_COUNTDOWN_S);
            if (countdownRef.current) clearInterval(countdownRef.current);
            onLockTriggered?.();
            return SHUTDOWN_COUNTDOWN_S;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [showWarning, onLockTriggered]);

  // Activity listeners
  useEffect(() => {
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ];

    const handleActivity = () => {
      if (isActive && !showWarning) {
        dismiss();
      } else if (!isActive && !lockedRef.current) {
        resetTimer();
      }
    };

    events.forEach((e) => window.addEventListener(e, handleActivity));
    if (!lockedRef.current) resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isActive, showWarning, dismiss, resetTimer]);

  // Tick clock every second when screensaver is active
  useEffect(() => {
    if (isActive) {
      setNow(new Date());
      intervalRef.current = setInterval(() => setNow(new Date()), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  const homeTz = TRADING_ZONES.find((z) => z.isHome)!.tz;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key="screensaver"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, delay: 0.1 } }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] bg-[#050505] flex flex-col select-none"
        >
          {/* Subtle grid pattern overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />

          {/* Top bar */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.5 }}
            className="flex items-center justify-between px-6 sm:px-10 py-4 relative z-10"
          >
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/25">
                GoldStrike Trading Sessions
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismiss();
              }}
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/15 hover:text-white/50 transition-colors border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-sm"
            >
              ESC
            </button>
          </motion.div>

          {/* Clock rows */}
          <div className="flex-1 flex flex-col justify-center relative z-10">
            {TRADING_ZONES.map((zone, i) => {
              const delta = zone.isHome
                ? 0
                : getDeltaHours(homeTz, zone.tz, now);
              const timeStr = formatTime(now, zone.tz);
              const period = formatPeriod(now, zone.tz);
              const secs = formatSeconds(now, zone.tz);
              const deltaSign = delta > 0 ? "+" : "";
              const deltaStr =
                delta !== 0 ? `${deltaSign}${delta}h` : "";
              const session = getSessionStatus(zone.tz, now);
              const gradient = getTimeOfDayGradient(zone.tz, now);

              return (
                <motion.div
                  key={zone.id}
                  initial={{ opacity: 0, x: -300, filter: "blur(12px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{
                    opacity: 0,
                    y: -60,
                    filter: "blur(8px)",
                    transition: {
                      duration: 0.3,
                      delay: (TRADING_ZONES.length - 1 - i) * 0.08,
                    },
                  }}
                  transition={{
                    duration: 0.8,
                    delay: 0.15 + i * 0.25,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                  className={`group flex items-center justify-between px-6 sm:px-10 lg:px-16 py-3 sm:py-0 flex-1 min-h-0 overflow-hidden relative bg-gradient-to-r ${gradient} ${
                    zone.isHome
                      ? "border-l-2 border-l-amber-500/40"
                      : "border-l-2 border-l-transparent"
                  }`}
                >
                  {/* Subtle separator line */}
                  {i > 0 && (
                    <div className="absolute top-0 left-6 right-6 sm:left-10 sm:right-10 h-px bg-white/[0.04]" />
                  )}

                  {/* Left: flag + info */}
                  <div className="flex items-center gap-4 sm:gap-6 min-w-0">
                    <span
                      className={`fi fi-${zone.countryCode} rounded shadow-lg shadow-black/30`}
                      style={{
                        fontSize: "clamp(2.5rem, 6vw, 5rem)",
                        lineHeight: 1,
                      }}
                    />
                    <div className="min-w-0 flex flex-col gap-1">
                      <div
                        className="font-mono font-bold text-white/90 tracking-wider uppercase leading-none truncate"
                        style={{ fontSize: "clamp(18px, 4vw, 48px)" }}
                      >
                        {zone.label}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <span
                          className="font-mono text-white/25 uppercase tracking-[0.2em] truncate"
                          style={{ fontSize: "clamp(8px, 1.2vw, 14px)" }}
                        >
                          {zone.sublabel}
                        </span>
                        {zone.isHome && (
                          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-500/50 border border-amber-500/15 px-1.5 py-0.5 rounded-sm">
                            home
                          </span>
                        )}
                        {deltaStr && (
                          <motion.span
                            key={deltaStr}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={`font-mono font-bold tracking-wider ${
                              delta > 0
                                ? "text-emerald-400/70"
                                : "text-red-400/70"
                            }`}
                            style={{
                              fontSize: "clamp(12px, 2vw, 22px)",
                            }}
                          >
                            {deltaStr}
                          </motion.span>
                        )}
                      </div>
                      <span
                        className={`font-mono text-[10px] sm:text-xs uppercase tracking-[0.2em] ${session.color}`}
                      >
                        {session.label}
                      </span>
                    </div>
                  </div>

                  {/* Right: time */}
                  <div className="flex items-baseline gap-1 sm:gap-2 shrink-0">
                    <div
                      className="font-mono font-bold text-white/90 tabular-nums tracking-wider"
                      style={{
                        fontSize: "clamp(36px, 8vw, 96px)",
                        lineHeight: 1,
                      }}
                    >
                      {timeStr}
                    </div>
                    <div className="flex flex-col items-start">
                      <span
                        className="font-mono font-bold text-white/20 tracking-wider"
                        style={{
                          fontSize: "clamp(10px, 1.5vw, 20px)",
                          lineHeight: 1.3,
                        }}
                      >
                        {period}
                      </span>
                      <span
                        className="font-mono tabular-nums text-white/10 tracking-wider"
                        style={{
                          fontSize: "clamp(9px, 1.2vw, 16px)",
                          lineHeight: 1.3,
                        }}
                      >
                        :{secs}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Warning Countdown Overlay */}
          <AnimatePresence>
            {showWarning && (
              <motion.div
                key="shutdown-warning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center"
                style={{
                  background: "radial-gradient(ellipse at center, rgba(0,0,0,0.95) 0%, rgba(3,3,3,0.98) 100%)",
                }}
              >
                {/* Matrix rain background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.06]">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute font-mono text-[8px] text-emerald-400 leading-[10px] break-all whitespace-pre-wrap"
                      style={{
                        left: `${(i / 12) * 100}%`,
                        width: "8%",
                        top: 0,
                        bottom: 0,
                      }}
                      animate={{ y: ["-100%", "0%"] }}
                      transition={{
                        duration: 8 + i * 2,
                        repeat: Infinity,
                        ease: "linear",
                        delay: i * 0.3,
                      }}
                    >
                      {Array.from({ length: 200 }, () =>
                        Math.floor(Math.random() * 16).toString(16)
                      ).join("")}
                    </motion.div>
                  ))}
                </div>

                {/* Scanning line */}
                <motion.div
                  className="absolute left-0 right-0 h-0.5 pointer-events-none z-30"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(239,68,68,0.3), transparent)",
                  }}
                  animate={{ top: ["0%", "100%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />

                {/* Vault door border effect */}
                <motion.div
                  className="absolute inset-8 border-2 border-red-500/10 rounded-2xl pointer-events-none"
                  animate={{
                    borderColor: ["rgba(239,68,68,0.1)", "rgba(239,68,68,0.25)", "rgba(239,68,68,0.1)"],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />

                {/* Corner brackets */}
                {[
                  "top-6 left-6 border-t-2 border-l-2 rounded-tl-xl",
                  "top-6 right-6 border-t-2 border-r-2 rounded-tr-xl",
                  "bottom-6 left-6 border-b-2 border-l-2 rounded-bl-xl",
                  "bottom-6 right-6 border-b-2 border-r-2 rounded-br-xl",
                ].map((pos) => (
                  <motion.div
                    key={pos}
                    className={`absolute w-8 h-8 ${pos} border-red-500/20 pointer-events-none`}
                    animate={{ opacity: [0.3, 0.8, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                ))}

                {/* Shield icon with pulse */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 120, damping: 15, delay: 0.2 }}
                  className="relative mb-6"
                >
                  {/* Outer pulse rings */}
                  <motion.div
                    className="absolute inset-[-20px] rounded-full border-2 border-red-500/15"
                    animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <motion.div
                    className="absolute inset-[-10px] rounded-full border border-amber-500/10"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                  />
                  <div className="w-20 h-20 rounded-full bg-red-500/5 border-2 border-red-500/20 flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 4, repeat: Infinity }}
                    >
                      <ShieldAlert className="w-10 h-10 text-red-500/80" />
                    </motion.div>
                  </div>
                </motion.div>

                {/* Warning text */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="text-center mb-6"
                >
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500/80" />
                    <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-amber-500/80">
                      Security Protocol Initiated
                    </span>
                    <AlertTriangle className="w-4 h-4 text-amber-500/80" />
                  </div>
                  <h2
                    className="font-mono font-bold uppercase tracking-wider text-white/90 mb-2"
                    style={{ fontSize: "clamp(18px, 4vw, 36px)" }}
                  >
                    Temporary Shutdown
                  </h2>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/30 max-w-md">
                    Platform will be locked due to inactivity.
                    Move your mouse or press any key to cancel.
                  </p>
                </motion.div>

                {/* Countdown */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.6, type: "spring", stiffness: 150 }}
                  className="relative mb-6"
                >
                  {/* Countdown ring */}
                  <svg className="w-32 h-32" viewBox="0 0 128 128">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="rgba(255,255,255,0.04)"
                      strokeWidth="3"
                      fill="none"
                    />
                    <motion.circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="url(#countdownGradient)"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 56}
                      strokeDashoffset={
                        2 * Math.PI * 56 * (1 - countdown / SHUTDOWN_COUNTDOWN_S)
                      }
                      style={{
                        transform: "rotate(-90deg)",
                        transformOrigin: "center",
                        transition: "stroke-dashoffset 1s linear",
                      }}
                    />
                    <defs>
                      <linearGradient
                        id="countdownGradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="rgba(239,68,68,0.8)" />
                        <stop offset="100%" stopColor="rgba(251,191,36,0.6)" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.span
                      key={countdown}
                      initial={{ scale: 1.3, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="font-mono font-bold text-4xl tabular-nums text-red-400"
                    >
                      {countdown}
                    </motion.span>
                    <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/20 mt-1">
                      seconds
                    </span>
                  </div>
                </motion.div>

                {/* Lock indicator */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="flex items-center gap-3"
                >
                  <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <Lock className="w-3.5 h-3.5 text-white/20" />
                  </motion.div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/15">
                    Vault Lock Engaging
                  </span>
                  <motion.span
                    className="font-mono text-[9px] text-red-400/60"
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  >
                    ···
                  </motion.span>
                </motion.div>

                {/* Cancel hint */}
                <motion.button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWarning(false);
                    setCountdown(SHUTDOWN_COUNTDOWN_S);
                    dismiss();
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                  className="mt-8 font-mono text-[9px] uppercase tracking-[0.3em] text-white/15 hover:text-white/40 border border-white/[0.06] hover:border-white/15 px-4 py-2 rounded-md transition-all"
                >
                  Cancel Shutdown
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 2, duration: 1 }}
            className="text-center pb-6 pt-3 relative z-10"
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-white/8">
              move mouse or press any key to return
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
