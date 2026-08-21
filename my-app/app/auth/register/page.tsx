"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield, ShieldCheck,
  Lock, Fingerprint, Eye, EyeOff,
  KeyRound, Zap, Cpu,
  Server, Wifi, LogIn,
  Sparkles, User, Mail, Globe,
  ChevronRight, ArrowLeft, CheckCircle2, Copy,
} from "lucide-react";

function randomHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("").toUpperCase();
}

function generateBirgenId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const seg2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `BAI-${seg1}-${seg2}`;
}

type Step = "info" | "pin" | "complete";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("info");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState<string[]>(["", "", "", ""]);
  const [pinPhase, setPinPhase] = useState<"create" | "confirm">("create");
  const [activeDigit, setActiveDigit] = useState(0);
  const [birgenId, setBirgenId] = useState("");
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [hexStream, setHexStream] = useState(randomHex(32));
  const [mounted, setMounted] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);

  const nameRef = useRef<HTMLInputElement>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setHexStream(randomHex(32)), 150);
    // Generate floating particles
    setParticles(
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 5,
      }))
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (step === "info") setTimeout(() => nameRef.current?.focus(), 300);
    if (step === "pin") setTimeout(() => pinRefs.current[0]?.focus(), 300);
  }, [step]);

  const handleInfoNext = () => {
    if (!displayName.trim() || !email.trim()) return;
    setStep("pin");
  };

  const handleDigitChange = (
    index: number,
    value: string,
    arr: string[],
    setArr: (v: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (!/^\d?$/.test(value)) return;
    const newPin = [...arr];
    newPin[index] = value;
    setArr(newPin);
    if (value && index < 3) {
      setActiveDigit(index + 1);
      setTimeout(() => refs.current[index + 1]?.focus(), 0);
    }
  };

  const handleDigitKeyDown = (
    index: number,
    e: React.KeyboardEvent,
    arr: string[],
    setArr: (v: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (e.key === "Backspace" && !arr[index] && index > 0) {
      setActiveDigit(index - 1);
      const newPin = [...arr];
      newPin[index - 1] = "";
      setArr(newPin);
      setTimeout(() => refs.current[index - 1]?.focus(), 0);
    }
  };

  // Auto-advance from create to confirm
  useEffect(() => {
    if (pinPhase === "create" && pin.every((d) => d !== "")) {
      setTimeout(() => {
        setPinPhase("confirm");
        setActiveDigit(0);
        setTimeout(() => confirmPinRefs.current[0]?.focus(), 100);
      }, 300);
    }
  }, [pin, pinPhase]);

  // Auto-submit when confirm is complete
  useEffect(() => {
    if (pinPhase === "confirm" && confirmPin.every((d) => d !== "")) {
      const pinStr = pin.join("");
      const confirmStr = confirmPin.join("");
      if (pinStr === confirmStr) {
        handleCreate();
      } else {
        // Reset confirm
        setTimeout(() => {
          setConfirmPin(["", "", "", ""]);
          setActiveDigit(0);
          setTimeout(() => confirmPinRefs.current[0]?.focus(), 100);
        }, 500);
      }
    }
  }, [confirmPin, pinPhase]);

  const handleCreate = () => {
    if (isCreating) return;
    setIsCreating(true);
    const newId = generateBirgenId();

    setTimeout(() => {
      setBirgenId(newId);
      setStep("complete");
      setIsCreating(false);
    }, 2500);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(birgenId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 bg-[#030303] flex flex-col select-none overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Mystical ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/[0.02] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/[0.015] rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/[0.01] rounded-full blur-[150px]" />
      </div>

      {/* Floating particles — mystical/GTA vibe */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute w-1 h-1 rounded-full bg-amber-500/20"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            animate={{
              y: [0, -30, 0],
              opacity: [0, 0.6, 0],
              scale: [0.5, 1.5, 0.5],
            }}
            transition={{
              duration: 4 + Math.random() * 3,
              repeat: Infinity,
              delay: p.delay,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Scanning line */}
      <motion.div
        className="absolute left-0 right-0 h-px pointer-events-none z-20"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.08), transparent)",
        }}
        animate={{ top: ["0%", "100%"] }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />

      {/* Matrix hex columns */}
      <div className="absolute left-1.5 top-14 bottom-14 w-5 overflow-hidden pointer-events-none opacity-[0.02]">
        <motion.div
          className="font-mono text-[5px] text-amber-300 leading-[7px] break-all whitespace-pre-wrap"
          animate={{ y: ["0%", "-50%"] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
          {randomHex(600)}
        </motion.div>
      </div>
      <div className="absolute right-1.5 top-14 bottom-14 w-5 overflow-hidden pointer-events-none opacity-[0.02]">
        <motion.div
          className="font-mono text-[5px] text-amber-300 leading-[7px] break-all whitespace-pre-wrap"
          animate={{ y: ["-50%", "0%"] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        >
          {randomHex(600)}
        </motion.div>
      </div>

      {/* Top security bar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="flex items-center justify-between px-4 sm:px-8 py-3 border-b border-white/[0.04] relative z-10 shrink-0"
      >
        <div className="flex items-center gap-3">
          <Shield className="w-4 h-4 text-amber-500/70" />
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/25">
            BirgenAI Hub — New Account
          </span>
          <span className="font-mono text-[7px] text-white/8 hidden md:inline tracking-wider">
            {hexStream}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/[0.06] hover:border-amber-500/20 hover:bg-white/[0.03] transition-all group"
          >
            <LogIn className="w-3 h-3 text-white/20 group-hover:text-amber-500/60 transition-colors" />
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/20 group-hover:text-white/50 transition-colors">
              Sign In
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-3 ml-2 border-l border-white/[0.04] pl-4">
            {[
              { icon: Lock, label: "AES-256" },
              { icon: Wifi, label: "TLS 1.3" },
              { icon: Server, label: "VAULT" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-emerald-500/60 animate-pulse" />
                <Icon className="w-3 h-3 text-emerald-500/40" />
                <span className="font-mono text-[7px] uppercase tracking-wider text-white/15">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Main — Centered card */}
      <div className="flex-1 flex items-center justify-center relative z-10 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-md"
        >
          <div className="relative border border-white/[0.06] rounded-2xl px-8 py-8 backdrop-blur-sm bg-white/[0.01] overflow-hidden">
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-amber-500/15 rounded-tl-2xl" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-amber-500/15 rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-amber-500/15 rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-amber-500/15 rounded-br-2xl" />

            {/* Account creation scanning bar */}
            {isCreating && (
              <motion.div
                className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent z-20"
                animate={{ top: ["0%", "100%", "0%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="text-center mb-6"
            >
              <div className="flex items-center justify-center gap-3 mb-3">
                <motion.div
                  animate={step === "complete" ? {
                    rotate: [0, 360],
                    scale: [1, 1.2, 1],
                  } : { rotate: [0, 360] }}
                  transition={{
                    duration: step === "complete" ? 2 : 20,
                    repeat: Infinity,
                    ease: step === "complete" ? "easeInOut" : "linear",
                  }}
                  className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${
                    step === "complete"
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-amber-500/20 bg-amber-500/5"
                  }`}
                >
                  {step === "complete" ? (
                    <Sparkles className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <Zap className="w-6 h-6 text-amber-500/70" />
                  )}
                </motion.div>
              </div>
              <h1 className="font-mono font-bold text-lg uppercase tracking-[0.3em] text-white/90 mb-1">
                {step === "complete" ? "Welcome, Agent" : "Join BirgenAI"}
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/20">
                {step === "complete"
                  ? "Your identity has been forged"
                  : step === "pin"
                    ? "Set your vault access code"
                    : "Begin your mission"}
              </p>
            </motion.div>

            {/* Step progress */}
            {step !== "complete" && (
              <div className="flex items-center justify-center gap-2 mb-6">
                {["info", "pin"].map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-full border flex items-center justify-center font-mono text-[10px] font-bold transition-all duration-500 ${
                        step === s
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                          : (s === "info" && step === "pin")
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-white/[0.06] text-white/15"
                      }`}
                    >
                      {(s === "info" && step === "pin") ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    {i < 1 && (
                      <div className={`w-12 h-px ${step === "pin" ? "bg-emerald-500/20" : "bg-white/[0.06]"}`} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Steps */}
            <AnimatePresence mode="wait">
              {step === "info" ? (
                <motion.div
                  key="info-step"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-4"
                >
                  <div>
                    <label className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20 mb-1.5 block">
                      Display Name (Alias)
                    </label>
                    <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-4 py-3 focus-within:border-amber-500/15 transition-all bg-black/20">
                      <User className="w-4 h-4 text-white/15 shrink-0" />
                      <input
                        ref={nameRef}
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Commander Nexus"
                        className="flex-1 bg-transparent font-mono text-sm text-white/80 placeholder:text-white/10 outline-none"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20 mb-1.5 block">
                      Email Address
                    </label>
                    <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-4 py-3 focus-within:border-amber-500/15 transition-all bg-black/20">
                      <Mail className="w-4 h-4 text-white/15 shrink-0" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleInfoNext();
                        }}
                        placeholder="agent@birgenai.com"
                        className="flex-1 bg-transparent font-mono text-sm text-white/80 placeholder:text-white/10 outline-none"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    onClick={handleInfoNext}
                    disabled={!displayName.trim() || !email.trim()}
                    whileHover={{ scale: displayName && email ? 1.02 : 1 }}
                    whileTap={{ scale: displayName && email ? 0.98 : 1 }}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg border font-mono text-[10px] uppercase tracking-[0.3em] transition-all duration-300 mt-2 ${
                      displayName.trim() && email.trim()
                        ? "border-white/10 bg-white/[0.03] text-white/60 hover:border-amber-500/20 hover:text-white/80 cursor-pointer"
                        : "border-white/[0.04] bg-transparent text-white/10 cursor-not-allowed"
                    }`}
                  >
                    <span>Continue</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </motion.button>
                </motion.div>
              ) : step === "pin" ? (
                <motion.div
                  key="pin-step"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.4 }}
                >
                  <button
                    type="button"
                    onClick={() => { setStep("info"); setPinPhase("create"); setPin(["","","",""]); setConfirmPin(["","","",""]); }}
                    className="flex items-center gap-1.5 mb-4 font-mono text-[9px] uppercase tracking-[0.2em] text-white/20 hover:text-white/40 transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back
                  </button>

                  <div className="text-center mb-4">
                    <div className="flex justify-center mb-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${
                        isCreating
                          ? "bg-amber-500/10 border-2 border-amber-500/20"
                          : pinPhase === "confirm"
                            ? "bg-emerald-500/5 border-2 border-emerald-500/15"
                            : "bg-white/[0.02] border-2 border-white/[0.06]"
                      }`}>
                        {isCreating ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                            <Cpu className="w-5 h-5 text-amber-400" />
                          </motion.div>
                        ) : (
                          <KeyRound className={`w-5 h-5 ${pinPhase === "confirm" ? "text-emerald-400/70" : "text-white/25"}`} />
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/25">
                      {isCreating
                        ? "Forging Your Identity..."
                        : pinPhase === "confirm"
                          ? "Confirm Your Access Code"
                          : "Create A 4-Digit Access Code"}
                    </span>
                  </div>

                  {/* PIN inputs */}
                  <div className="flex items-center justify-center gap-3 mb-3">
                    {(pinPhase === "create" ? pin : confirmPin).map((digit, i) => (
                      <motion.div
                        key={`${pinPhase}-${i}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="relative"
                      >
                        <input
                          ref={(el) => {
                            if (pinPhase === "create") {
                              pinRefs.current[i] = el;
                            } else {
                              confirmPinRefs.current[i] = el;
                            }
                          }}
                          type="password"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) =>
                            pinPhase === "create"
                              ? handleDigitChange(i, e.target.value, pin, setPin, pinRefs)
                              : handleDigitChange(i, e.target.value, confirmPin, setConfirmPin, confirmPinRefs)
                          }
                          onKeyDown={(e) =>
                            pinPhase === "create"
                              ? handleDigitKeyDown(i, e, pin, setPin, pinRefs)
                              : handleDigitKeyDown(i, e, confirmPin, setConfirmPin, confirmPinRefs)
                          }
                          onFocus={() => setActiveDigit(i)}
                          disabled={isCreating}
                          className={`w-14 h-16 text-center font-mono text-2xl font-bold bg-transparent border-2 rounded-lg outline-none transition-all duration-300 ${
                            digit
                              ? pinPhase === "confirm"
                                ? "border-emerald-500/25 text-white/80"
                                : "border-amber-500/25 text-white/80"
                              : activeDigit === i
                                ? "border-white/15 text-white/80"
                                : "border-white/[0.06] text-white/80"
                          }`}
                          autoComplete="off"
                        />
                        {activeDigit === i && !digit && !isCreating && (
                          <motion.div
                            className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full ${
                              pinPhase === "confirm" ? "bg-emerald-500/40" : "bg-amber-500/40"
                            }`}
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          />
                        )}
                      </motion.div>
                    ))}
                  </div>

                  <div className="text-center h-4">
                    <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/10">
                      {isCreating
                        ? "Creating secure vault..."
                        : pinPhase === "confirm"
                          ? "Re-enter to confirm"
                          : "Choose a memorable 4-digit PIN"}
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="complete-step"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6 }}
                  className="text-center"
                >
                  {/* Success burst */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 150, damping: 15 }}
                    className="relative inline-block mb-6"
                  >
                    <motion.div
                      className="absolute inset-[-12px] rounded-full border-2 border-emerald-400/20"
                      initial={{ scale: 0.8, opacity: 1 }}
                      animate={{ scale: 2.5, opacity: 0 }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <motion.div
                      className="absolute inset-[-6px] rounded-full border border-amber-500/15"
                      animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                    />
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-emerald-400" />
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h2 className="font-mono font-bold text-lg uppercase tracking-[0.3em] text-emerald-400 mb-1">
                      Identity Forged
                    </h2>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/25 mb-6">
                      Welcome to the network, {displayName}
                    </p>
                  </motion.div>

                  {/* BirgenAI ID Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="relative border border-amber-500/15 rounded-xl p-5 bg-amber-500/[0.02] mb-5"
                  >
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-500/20 rounded-tl-xl" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-500/20 rounded-tr-xl" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-500/20 rounded-bl-xl" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-500/20 rounded-br-xl" />

                    <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-amber-500/40 mb-2">
                      Your BirgenAI ID
                    </div>
                    <div className="font-mono text-2xl font-bold tracking-[0.2em] text-amber-400 mb-3">
                      {birgenId}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyId}
                      className="flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-md border border-white/[0.06] hover:border-amber-500/20 hover:bg-white/[0.03] transition-all group"
                    >
                      {copied ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-white/20 group-hover:text-amber-500/60 transition-colors" />
                      )}
                      <span className={`font-mono text-[9px] uppercase tracking-[0.2em] transition-colors ${
                        copied ? "text-emerald-400" : "text-white/20 group-hover:text-white/50"
                      }`}>
                        {copied ? "Copied!" : "Copy ID"}
                      </span>
                    </button>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="space-y-2"
                  >
                    <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/15">
                      Save your BirgenAI ID — you will need it to sign in
                    </p>
                    <motion.button
                      type="button"
                      onClick={() => router.push("/auth/login")}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-amber-500/10 hover:border-amber-500/30 transition-all cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Proceed to Login</span>
                    </motion.button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SSO notice */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="mt-6 pt-4 border-t border-white/[0.04] text-center"
            >
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/10 mb-2">
                One account · All BirgenAI platforms
              </p>
              <div className="flex items-center justify-center gap-3">
                {["GoldStrike", "Analytics", "Research"].map((platform) => (
                  <span
                    key={platform}
                    className="font-mono text-[7px] uppercase tracking-wider text-white/8 border border-white/[0.04] px-2 py-0.5 rounded"
                  >
                    {platform}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Bottom bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="text-center pb-5 pt-3 relative z-10"
      >
        <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/8">
          birgenai.com · Secure Infrastructure
        </span>
      </motion.div>
    </div>
  );
}
