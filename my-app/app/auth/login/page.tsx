"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield, ShieldCheck, ShieldAlert,
  Lock, Unlock, Fingerprint, Eye, EyeOff,
  KeyRound, Globe, Zap, Radio, Cpu,
  Server, Wifi, UserPlus, ChevronRight,
  Terminal, ArrowLeft,
} from "lucide-react";

function randomHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("").toUpperCase();
}

type LoginMethod = "birgenai" | "access-code";

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<LoginMethod | null>(null);
  const [birgenId, setBirgenId] = useState("");
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [activeDigit, setActiveDigit] = useState(0);
  const [authState, setAuthState] = useState<"idle" | "authenticating" | "success" | "denied">("idle");
  const [hexStream, setHexStream] = useState(randomHex(32));
  const [mounted, setMounted] = useState(false);

  const birgenInputRef = useRef<HTMLInputElement>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setHexStream(randomHex(32)), 150);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (method === "birgenai") {
      setTimeout(() => birgenInputRef.current?.focus(), 300);
    } else if (method === "access-code") {
      setTimeout(() => pinRefs.current[0]?.focus(), 300);
    }
  }, [method]);

  const handleBirgenLogin = () => {
    if (!birgenId.trim() || authState !== "idle") return;
    setAuthState("authenticating");
    setTimeout(() => {
      setAuthState("success");
      setTimeout(() => router.push("/dashboard"), 1200);
    }, 2000);
  };

  const handlePinLogin = () => {
    const pinStr = pin.join("");
    if (pinStr.length < 4 || authState !== "idle") return;
    setAuthState("authenticating");
    setTimeout(() => {
      setAuthState("success");
      setTimeout(() => router.push("/dashboard"), 1200);
    }, 2000);
  };

  const handleDigitChange = (index: number, value: string) => {
    if (authState !== "idle") return;
    if (!/^\d?$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    if (value && index < 3) {
      setActiveDigit(index + 1);
      setTimeout(() => pinRefs.current[index + 1]?.focus(), 0);
    }
    if (newPin.every((d) => d !== "")) {
      setTimeout(() => handlePinLogin(), 300);
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (authState !== "idle") return;
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      setActiveDigit(index - 1);
      const newPin = [...pin];
      newPin[index - 1] = "";
      setPin(newPin);
      setTimeout(() => pinRefs.current[index - 1]?.focus(), 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handlePinLogin();
    }
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

      {/* Scanning line */}
      <motion.div
        className="absolute left-0 right-0 h-px pointer-events-none z-20"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.12), transparent)",
        }}
        animate={{ top: ["0%", "100%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />

      {/* Matrix hex columns */}
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
            BirgenAI Hub — Secure Authentication
          </span>
          <span className="font-mono text-[7px] text-white/8 hidden md:inline tracking-wider">
            {hexStream}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/auth/register"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-500/15 hover:border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-all group"
          >
            <UserPlus className="w-3 h-3 text-amber-500/40 group-hover:text-amber-500/70 transition-colors" />
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-amber-500/40 group-hover:text-amber-500/70 transition-colors">
              Create Account
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

      {/* Main content — iPhone style centered card */}
      <div className="flex-1 flex items-center justify-center relative z-10 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-md"
        >
          {/* Vault container */}
          <div className="relative border border-white/[0.06] rounded-2xl px-8 py-10 backdrop-blur-sm bg-white/[0.01] overflow-hidden">
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-amber-500/15 rounded-tl-2xl" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-amber-500/15 rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-amber-500/15 rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-amber-500/15 rounded-br-2xl" />

            {/* Auth scanning line during verification */}
            {authState === "authenticating" && (
              <motion.div
                className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent z-20 rounded-full"
                animate={{ top: ["10%", "90%", "10%"] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            {/* BirgenAI Logo / Title */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="text-center mb-8"
            >
              <div className="flex items-center justify-center gap-3 mb-3">
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 rounded-full border-2 border-amber-500/20 flex items-center justify-center bg-amber-500/5"
                >
                  <Zap className="w-6 h-6 text-amber-500/70" />
                </motion.div>
              </div>
              <h1 className="font-mono font-bold text-xl uppercase tracking-[0.3em] text-white/90 mb-1">
                BirgenAI Hub
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/20">
                Unified Access Portal
              </p>
            </motion.div>

            {/* Method selection or active method */}
            <AnimatePresence mode="wait">
              {!method ? (
                <motion.div
                  key="method-select"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-3"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/25 text-center mb-4">
                    Select Authentication Method
                  </p>

                  {/* BirgenAI ID Login */}
                  <button
                    type="button"
                    onClick={() => setMethod("birgenai")}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] hover:border-amber-500/20 bg-white/[0.01] hover:bg-amber-500/5 transition-all group"
                  >
                    <div className="w-11 h-11 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/15 transition-all">
                      <Zap className="w-5 h-5 text-amber-500/70" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-mono text-sm font-bold uppercase tracking-wider text-white/80 group-hover:text-white/95 transition-colors">
                        BirgenAI ID
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/20">
                        Sign in with your BirgenAI identifier
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-amber-500/50 transition-colors" />
                  </button>

                  {/* Access Code Login */}
                  <button
                    type="button"
                    onClick={() => setMethod("access-code")}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] hover:border-emerald-500/20 bg-white/[0.01] hover:bg-emerald-500/5 transition-all group"
                  >
                    <div className="w-11 h-11 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/15 transition-all">
                      <KeyRound className="w-5 h-5 text-emerald-500/70" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-mono text-sm font-bold uppercase tracking-wider text-white/80 group-hover:text-white/95 transition-colors">
                        Access Code
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/20">
                        Enter your 4-digit PIN
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-emerald-500/50 transition-colors" />
                  </button>
                </motion.div>
              ) : method === "birgenai" ? (
                <motion.div
                  key="birgenai-form"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.4 }}
                >
                  <button
                    type="button"
                    onClick={() => { setMethod(null); setAuthState("idle"); setBirgenId(""); }}
                    className="flex items-center gap-1.5 mb-5 font-mono text-[9px] uppercase tracking-[0.2em] text-white/20 hover:text-white/40 transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back
                  </button>

                  {/* Auth status icon */}
                  <div className="flex justify-center mb-4">
                    <div className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 ${
                      authState === "success"
                        ? "bg-emerald-500/10 border-2 border-emerald-500/30"
                        : authState === "authenticating"
                          ? "bg-amber-500/5 border-2 border-amber-500/20"
                          : "bg-amber-500/5 border-2 border-amber-500/15"
                    }`}>
                      {authState === "authenticating" && (
                        <motion.div
                          className="absolute inset-[-2px] rounded-full border-2 border-transparent border-t-amber-500/50"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                      )}
                      {authState === "success" ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <Unlock className="w-6 h-6 text-emerald-400" />
                        </motion.div>
                      ) : authState === "authenticating" ? (
                        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                          <Fingerprint className="w-6 h-6 text-amber-400" />
                        </motion.div>
                      ) : (
                        <Zap className="w-6 h-6 text-amber-500/70" />
                      )}
                    </div>
                  </div>

                  <div className="text-center mb-5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/25">
                      {authState === "success" ? "Access Granted" : authState === "authenticating" ? "Verifying BirgenAI ID..." : "Enter Your BirgenAI ID"}
                    </span>
                  </div>

                  <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 mb-4 transition-all duration-300 ${
                    authState === "success"
                      ? "border-emerald-500/20 bg-emerald-950/20"
                      : birgenId
                        ? "border-amber-500/15 bg-white/[0.03]"
                        : "border-white/[0.06] bg-black/20"
                  }`}>
                    <Terminal className="w-4 h-4 text-white/15 shrink-0" />
                    <input
                      ref={birgenInputRef}
                      type="text"
                      value={birgenId}
                      onChange={(e) => setBirgenId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleBirgenLogin();
                      }}
                      disabled={authState !== "idle"}
                      placeholder="BAI-XXXX-XXXX"
                      className="flex-1 bg-transparent font-mono text-sm text-white/80 placeholder:text-white/10 outline-none tracking-[0.1em]"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>

                  <motion.button
                    type="button"
                    onClick={handleBirgenLogin}
                    disabled={authState !== "idle" || !birgenId.trim()}
                    whileHover={{ scale: authState === "idle" && birgenId ? 1.02 : 1 }}
                    whileTap={{ scale: authState === "idle" && birgenId ? 0.98 : 1 }}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg border font-mono text-[10px] uppercase tracking-[0.3em] transition-all duration-300 ${
                      authState === "success"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : authState === "authenticating"
                          ? "border-amber-500/20 bg-amber-500/5 text-amber-400"
                          : birgenId
                            ? "border-white/10 bg-white/[0.03] text-white/60 hover:border-amber-500/20 hover:text-white/80 cursor-pointer"
                            : "border-white/[0.04] bg-transparent text-white/10 cursor-not-allowed"
                    }`}
                  >
                    {authState === "success" ? (
                      <><ShieldCheck className="w-3.5 h-3.5" /><span>Welcome Back</span></>
                    ) : authState === "authenticating" ? (
                      <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><Cpu className="w-3.5 h-3.5" /></motion.div><span>Authenticating</span></>
                    ) : (
                      <><Shield className="w-3.5 h-3.5" /><span>Sign In</span></>
                    )}
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div
                  key="pin-form"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.4 }}
                >
                  <button
                    type="button"
                    onClick={() => { setMethod(null); setAuthState("idle"); setPin(["", "", "", ""]); }}
                    className="flex items-center gap-1.5 mb-5 font-mono text-[9px] uppercase tracking-[0.2em] text-white/20 hover:text-white/40 transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back
                  </button>

                  <div className="flex justify-center mb-4">
                    <div className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 ${
                      authState === "success"
                        ? "bg-emerald-500/10 border-2 border-emerald-500/30"
                        : authState === "authenticating"
                          ? "bg-amber-500/5 border-2 border-amber-500/20"
                          : "bg-emerald-500/5 border-2 border-emerald-500/15"
                    }`}>
                      {authState === "authenticating" && (
                        <motion.div
                          className="absolute inset-[-2px] rounded-full border-2 border-transparent border-t-amber-500/50"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                      )}
                      {authState === "success" ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <Unlock className="w-6 h-6 text-emerald-400" />
                        </motion.div>
                      ) : authState === "authenticating" ? (
                        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                          <Fingerprint className="w-6 h-6 text-amber-400" />
                        </motion.div>
                      ) : (
                        <KeyRound className="w-6 h-6 text-emerald-500/70" />
                      )}
                    </div>
                  </div>

                  <div className="text-center mb-5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/25">
                      {authState === "success" ? "Access Granted" : authState === "authenticating" ? "Verifying..." : "Enter Your 4-Digit Access Code"}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-3 mb-5">
                    {pin.map((digit, i) => (
                      <div key={i} className="relative">
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
                                : digit
                                  ? "border-amber-500/25 text-white/80"
                                  : activeDigit === i
                                    ? "border-white/15 text-white/80"
                                    : "border-white/[0.06] text-white/80"
                          }`}
                          autoComplete="off"
                        />
                        {activeDigit === i && authState === "idle" && !digit && (
                          <motion.div
                            className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-amber-500/40 rounded-full"
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SSO notice */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="mt-8 pt-5 border-t border-white/[0.04] text-center"
            >
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/10 mb-2">
                Single Sign-On · All BirgenAI platforms
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
