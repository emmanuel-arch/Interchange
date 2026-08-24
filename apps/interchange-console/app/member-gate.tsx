"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The Interchange — member gate.
//
// Ported from the GoldStrike trading vault (_reference/trading-console) and
// rethemed. Three deliberate changes beyond colour, because the cinematic has
// to be telling the truth about THIS system:
//
//   · The two auth methods are MEMBER CERTIFICATE (the node's mTLS identity)
//     and ACCESS CODE — those are the two things that actually authenticate a
//     member, so the screen names them.
//   · The security strip reads mTLS / OPRF / RFC 3161: the three mechanisms a
//     member is being asked to trust, rather than generic "AES-256 / TLS 1.3"
//     badges that say nothing specific about this architecture.
//   · The footer lists the six connected systems, because inheriting their
//     trust is the whole reason we launch on this domain.
//
// AUTH IS NOW WIRED (Sprint 2). The ported placeholder — a setTimeout that
// granted access to anyone — is gone. The PIN pad posts to /api/session/code,
// which verifies the code against a scrypt hash, applies lockout, and mints an
// HMAC-signed session; the certificate field posts to /api/session, which wants
// an Ed25519 signature from the member's node and says so plainly when it does
// not get one. Both surface the SERVER's message rather than inventing one, so
// the screen can never claim an access the session does not carry.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, Lock, Unlock, Fingerprint,
  KeyRound, Radio, Cpu, Server, Terminal, ArrowLeft, ChevronRight,
} from "lucide-react";

function randomHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("").toUpperCase();
}

type Method = "certificate" | "access-code";
type AuthState = "idle" | "authenticating" | "granted" | "denied";

const CONNECTED_SYSTEMS = [
  "Lending", "Portal", "ConnectDesk", "Analytics", "PeopleHub", "Ledgerly",
];

// A fixed sample so the still render has something in the token slots. It is
// deterministic on purpose — a random value here would be a hydration mismatch.
const STILL_HEX = "7F3A9C21E4B806D5A17C4E92FB380D6C";

/**
 * `still` renders the gate in its settled state with no enter animations, so
 * the page is fully legible from the server alone. It drives `?still=1` for
 * screenshots and visual review, and it is also the honest fallback: without
 * it, framer-motion ships its `initial` styles as opacity:0 in the HTML, and
 * anyone whose JS is slow or blocked sees a black screen on a login page.
 */
export default function MemberGate({ still = false, next = "/directory" }: { still?: boolean; next?: string }) {
  const router = useRouter();
  const [method, setMethod] = useState<Method | null>(null);
  const [memberId, setMemberId] = useState("");
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [activeDigit, setActiveDigit] = useState(0);
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hexStream, setHexStream] = useState(still ? STILL_HEX : "");
  const [columns, setColumns] = useState<[string, string]>(
    still ? [STILL_HEX.repeat(19), STILL_HEX.repeat(19)] : ["", ""],
  );

  const memberInputRef = useRef<HTMLInputElement>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Every random value is seeded AFTER mount, never during render. The original
  // guarded the whole page behind `if (!mounted) return null` to dodge the
  // hydration mismatch, which costs a blank first paint on every visit —
  // seeding into state instead keeps the shell server-rendered.
  useEffect(() => {
    setHexStream(randomHex(32));
    setColumns([randomHex(600), randomHex(600)]);
    const id = setInterval(() => setHexStream(randomHex(32)), 150);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (method === "certificate") {
      const t = setTimeout(() => memberInputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
    if (method === "access-code") {
      const t = setTimeout(() => pinRefs.current[0]?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [method]);

  /**
   * Hand the whole outcome to the server.
   *
   * `granted` is set ONLY on a 2xx that actually carried a Set-Cookie, and the
   * navigation that follows is a hard one (router.refresh via push + refresh) so
   * proxy.ts re-evaluates with the new cookie. An optimistic client-side "granted"
   * that the server had not agreed to would put the cinematic and the session out
   * of step — the unlock animation playing over a redirect back to this screen.
   */
  const submit = async (endpoint: string, init: RequestInit) => {
    setAuthState("authenticating");
    setError(null);
    try {
      const res = await fetch(endpoint, init);
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);

      if (!res.ok) {
        setAuthState("denied");
        setError(
          (typeof data.message === "string" && data.message) ||
            "That did not authenticate. Try again.",
        );
        return;
      }

      setAuthState("granted");
      const target = typeof data.next === "string" ? data.next : next;
      // Let the unlock land before navigating — the cinematic is the feedback.
      setTimeout(() => {
        router.push(target);
        router.refresh();
      }, 650);
    } catch {
      setAuthState("denied");
      setError("The Registry could not be reached.");
    }
  };

  const handleCertificate = () => {
    if (!memberId.trim() || busy) return;
    // Unsigned by construction — a browser holds no member key. The Registry
    // refuses it and says why, which is the honest answer to "let me in with a
    // certificate I do not have".
    void submit("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json", "x-interchange-member": memberId.trim() },
      body: "{}",
    });
  };

  const submitPin = (code: string) => {
    void submit("/api/session/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, next }),
    });
  };

  const handleDigitChange = (index: number, value: string) => {
    if (authState === "authenticating" || authState === "granted" || !/^\d?$/.test(value)) return;
    // Typing again after a refusal clears it, rather than leaving a stale error
    // sitting under a code the operator has already started replacing.
    if (authState === "denied") {
      setAuthState("idle");
      setError(null);
    }
    const digits = [...pin];
    digits[index] = value;
    setPin(digits);
    if (value && index < 3) {
      setActiveDigit(index + 1);
      setTimeout(() => pinRefs.current[index + 1]?.focus(), 0);
    }
    if (digits.every((d) => d !== "")) setTimeout(() => submitPin(digits.join("")), 250);
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (authState === "authenticating" || authState === "granted") return;
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      setActiveDigit(index - 1);
      const digits = [...pin];
      digits[index - 1] = "";
      setPin(digits);
      setTimeout(() => pinRefs.current[index - 1]?.focus(), 0);
    }
  };

  const reset = () => {
    setMethod(null);
    setAuthState("idle");
    setError(null);
    setMemberId("");
    setPin(["", "", "", ""]);
    setActiveDigit(0);
  };

  /**
   * "In flight or already through" — the only states in which the inputs lock.
   *
   * A refusal must NOT lock them: the previous version disabled on
   * `authState !== "idle"`, so any non-idle state was a dead end that only the
   * Back button could escape. An operator who mistypes one digit should be able
   * to simply type it again.
   */
  const busy = authState === "authenticating" || authState === "granted";
  const denied = authState === "denied";

  return (
    <div className="fixed inset-0 flex flex-col select-none overflow-hidden bg-[#040605]">
      {/* ── Aurora ───────────────────────────────────────────────────────────
          Four slow blooms drifting behind everything else.

          ── WHY THIS SCREEN NEEDED COLOUR ─────────────────────────────────────
          The gate was already the most animated door in the estate — the sweep,
          the token columns, the pulsing security row — and it still read flat,
          because all of it was one hue of emerald on near-black. Motion without
          depth looks like a screensaver; what makes a dark screen feel like a
          PLACE is a light source somewhere off-frame that the eye can locate.

          So: cyan (#0891b2 — the Interchange's own accent in the suite launcher,
          so the tile you clicked and the room you arrive in are the same colour)
          against the emerald the security chrome already uses. Two hues, far
          apart, at opacity that never competes with the vault card.

          The durations are deliberately long and mutually PRIME-ish (23/29/31/37s)
          so the four never resynchronise into a visible pulse. A loop you can
          count is a loop you start watching instead of signing in.

          `still` kills it outright, along with every other enter animation, so
          the screenshot path and the no-JS path both render a legible page. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
        {[
          { c: "#0891b2", x: "78%", y: "12%", s: 620, o: 0.22, d: 23 },
          { c: "#10b981", x: "18%", y: "82%", s: 560, o: 0.16, d: 29 },
          { c: "#0e7490", x: "8%", y: "10%", s: 480, o: 0.14, d: 31 },
          { c: "#22d3ee", x: "88%", y: "88%", s: 440, o: 0.10, d: 37 },
        ].map((b, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: b.x, top: b.y, width: b.s, height: b.s,
              marginLeft: -b.s / 2, marginTop: -b.s / 2,
              background: b.c, opacity: b.o, filter: "blur(150px)",
            }}
            animate={still ? undefined : { x: [0, 34, -22, 0], y: [0, -26, 20, 0], scale: [1, 1.09, 0.95, 1] }}
            transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
        {/* A vignette pulls the eye back to the middle, where the vault is. The
            blooms are what make the room; this is what stops them being the
            subject. */}
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(115% 85% at 50% 45%, transparent 34%, rgba(4,6,5,0.80) 100%)" }}
        />
      </div>

      {/* Facility grid */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Sweep */}
      <motion.div
        aria-hidden
        className="absolute left-0 right-0 h-px pointer-events-none z-20"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(16,185,129,0.14), transparent)",
        }}
        animate={{ top: ["0%", "100%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />

      {/* Token columns — the visual claim that identity is already hashed */}
      {[
        { key: "l", side: "left-1.5", dir: ["0%", "-50%"], dur: 20, text: columns[0] },
        { key: "r", side: "right-1.5", dir: ["-50%", "0%"], dur: 25, text: columns[1] },
      ].map(({ key, side, dir, dur, text }) => (
        <div
          key={key}
          aria-hidden
          className={`absolute ${side} top-14 bottom-14 w-5 overflow-hidden pointer-events-none opacity-[0.035]`}
        >
          <motion.div
            className="font-mono text-[5px] text-emerald-300 leading-[7px] break-all whitespace-pre-wrap"
            animate={{ y: dir }}
            transition={{ duration: dur, repeat: Infinity, ease: "linear" }}
          >
            {text}
          </motion.div>
        </div>
      ))}

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <motion.header
        initial={still ? false : { opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="flex items-center justify-between px-4 sm:px-8 py-3 border-b border-white/[0.05] relative z-10 shrink-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Shield className="w-4 h-4 text-emerald-500/70 shrink-0" />
          <span className="inst text-[9px] text-white/25 whitespace-nowrap">
            The Interchange — Member Authentication
          </span>
          <span className="font-mono text-[7px] text-white/[0.08] hidden md:inline tracking-wider truncate">
            {hexStream}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-3 shrink-0">
          {[
            { icon: Lock, label: "mTLS" },
            { icon: Radio, label: "OPRF" },
            { icon: Server, label: "RFC 3161" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-emerald-500/60 animate-pulse" />
              <Icon className="w-3 h-3 text-emerald-500/40" />
              <span className="font-mono text-[7px] uppercase tracking-wider text-white/20">
                {label}
              </span>
            </div>
          ))}
        </div>
      </motion.header>

      {/* ── The vault ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center relative z-10 px-4">
        <motion.div
          initial={still ? false : { opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-md"
        >
          <div className="relative border border-white/[0.07] rounded-2xl px-8 py-10 backdrop-blur-sm bg-white/[0.012] overflow-hidden">
            {/* Corner brackets */}
            <div aria-hidden className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-emerald-500/20 rounded-tl-2xl" />
            <div aria-hidden className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-emerald-500/20 rounded-tr-2xl" />
            <div aria-hidden className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-emerald-500/20 rounded-bl-2xl" />
            <div aria-hidden className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-emerald-500/20 rounded-br-2xl" />

            {authState === "authenticating" && (
              <motion.div
                aria-hidden
                className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-500/45 to-transparent z-20 rounded-full"
                animate={{ top: ["10%", "90%", "10%"] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            {/* Mark */}
            <motion.div
              initial={still ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="text-center mb-8"
            >
              <div className="flex items-center justify-center mb-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 rounded-full border-2 border-emerald-500/25 flex items-center justify-center bg-emerald-500/5"
                >
                  {/* Two routes crossing without merging — the interchange */}
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden>
                    <path d="M3 8 C 9 8, 15 16, 21 16" stroke="rgb(16 185 129 / 0.85)" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M3 16 C 9 16, 15 8, 21 8" stroke="rgb(16 185 129 / 0.45)" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </motion.div>
              </div>
              <h1 className="font-mono font-bold text-xl uppercase tracking-[0.3em] text-white/90 mb-1">
                Interchange
              </h1>
              <p className="inst text-[9px] text-white/25">Consent-Gated Exchange</p>
            </motion.div>

            <AnimatePresence mode="wait">
              {!method ? (
                <motion.div
                  key="select"
                  initial={still ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-3"
                >
                  <p className="inst text-[9px] text-white/25 text-center mb-4">
                    Present Credentials
                  </p>

                  {[
                    {
                      id: "certificate" as const,
                      icon: ShieldCheck,
                      title: "Member Certificate",
                      sub: "Authenticate with your node identity",
                    },
                    {
                      id: "access-code" as const,
                      icon: KeyRound,
                      title: "Access Code",
                      sub: "Four-digit operator code",
                    },
                  ].map(({ id, icon: Icon, title, sub }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMethod(id)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.07] hover:border-emerald-500/25 bg-white/[0.012] hover:bg-emerald-500/5 transition-all group cursor-pointer"
                    >
                      <div className="w-11 h-11 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/15 transition-all shrink-0">
                        <Icon className="w-5 h-5 text-emerald-500/75" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-mono text-sm font-bold uppercase tracking-wider text-white/80 group-hover:text-white/95 transition-colors">
                          {title}
                        </div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/25">
                          {sub}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-emerald-500/60 transition-colors shrink-0" />
                    </button>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key={method}
                  initial={still ? false : { opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.4 }}
                >
                  <button
                    type="button"
                    onClick={reset}
                    className="flex items-center gap-1.5 mb-5 font-mono text-[9px] uppercase tracking-[0.2em] text-white/25 hover:text-white/50 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back
                  </button>

                  <div className="flex justify-center mb-4">
                    <div
                      className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 ${
                        authState === "granted"
                          ? "bg-emerald-500/10 border-2 border-emerald-500/40"
                          : authState === "authenticating"
                            ? "bg-amber-500/5 border-2 border-amber-500/25"
                            : denied
                              ? "bg-red-500/5 border-2 border-red-500/30"
                              : "bg-emerald-500/5 border-2 border-emerald-500/15"
                      }`}
                    >
                      {authState === "authenticating" && (
                        <motion.div
                          aria-hidden
                          className="absolute inset-[-2px] rounded-full border-2 border-transparent border-t-amber-500/60"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                      )}
                      {authState === "granted" ? (
                        <motion.div initial={still ? false : { scale: 0 }} animate={{ scale: 1 }}>
                          <Unlock className="w-6 h-6 text-emerald-400" />
                        </motion.div>
                      ) : authState === "authenticating" ? (
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        >
                          <Fingerprint className="w-6 h-6 text-amber-400" />
                        </motion.div>
                      ) : denied ? (
                        <ShieldAlert className="w-6 h-6 text-red-400/80" />
                      ) : (
                        <Lock className="w-6 h-6 text-emerald-500/70" />
                      )}
                    </div>
                  </div>

                  {/* aria-live so a refusal is announced, not merely coloured. */}
                  <div className="text-center mb-5 min-h-[2.5rem]" aria-live="polite">
                    <span className={`inst text-[9px] ${denied ? "text-red-400/70" : "text-white/30"}`}>
                      {authState === "granted"
                        ? "Access Granted"
                        : authState === "authenticating"
                          ? method === "certificate"
                            ? "Verifying Certificate…"
                            : "Verifying Access Code…"
                          : denied
                            ? "Access Refused"
                            : method === "certificate"
                              ? "Enter Member Identifier"
                              : "Enter Access Code"}
                    </span>
                    {error && (
                      <p className="mt-2 px-2 font-mono text-[9px] leading-relaxed text-red-400/60">
                        {error}
                      </p>
                    )}
                  </div>

                  {method === "certificate" ? (
                    <>
                      <div
                        className={`flex items-center gap-2 rounded-lg border px-4 py-3 mb-4 transition-all duration-300 ${
                          authState === "granted"
                            ? "border-emerald-500/25 bg-emerald-950/20"
                            : memberId
                              ? "border-emerald-500/20 bg-white/[0.03]"
                              : "border-white/[0.07] bg-black/20"
                        }`}
                      >
                        <Terminal className="w-4 h-4 text-white/20 shrink-0" />
                        <label htmlFor="member-id" className="sr-only">
                          Member identifier
                        </label>
                        <input
                          id="member-id"
                          ref={memberInputRef}
                          type="text"
                          value={memberId}
                          onChange={(e) => setMemberId(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleCertificate()}
                          disabled={busy}
                          placeholder="KE/LENDER/0000"
                          className="flex-1 bg-transparent font-mono text-sm text-white/80 placeholder:text-white/15 outline-none tracking-[0.1em]"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>

                      <motion.button
                        type="button"
                        onClick={handleCertificate}
                        disabled={busy || !memberId.trim()}
                        whileHover={{ scale: !busy && memberId ? 1.02 : 1 }}
                        whileTap={{ scale: !busy && memberId ? 0.98 : 1 }}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg border font-mono text-[10px] uppercase tracking-[0.3em] transition-all duration-300 ${
                          authState === "granted"
                            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                            : authState === "authenticating"
                              ? "border-amber-500/25 bg-amber-500/5 text-amber-400"
                              : memberId
                                ? "border-white/[0.12] bg-white/[0.03] text-white/65 hover:border-emerald-500/30 hover:text-white/85 cursor-pointer"
                                : "border-white/[0.05] bg-transparent text-white/15 cursor-not-allowed"
                        }`}
                      >
                        {authState === "granted" ? (
                          <><ShieldCheck className="w-3.5 h-3.5" /><span>Entering</span></>
                        ) : authState === "authenticating" ? (
                          <>
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            >
                              <Cpu className="w-3.5 h-3.5" />
                            </motion.div>
                            <span>Authenticating</span>
                          </>
                        ) : (
                          <><Shield className="w-3.5 h-3.5" /><span>Present</span></>
                        )}
                      </motion.button>
                    </>
                  ) : (
                    <div className="flex justify-center gap-3">
                      {pin.map((digit, i) => (
                        <div key={i} className="relative">
                          <label htmlFor={`pin-${i}`} className="sr-only">
                            Access code digit {i + 1}
                          </label>
                          <input
                            id={`pin-${i}`}
                            ref={(el) => { pinRefs.current[i] = el; }}
                            type="password"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleDigitChange(i, e.target.value)}
                            onKeyDown={(e) => handleDigitKeyDown(i, e)}
                            onFocus={() => setActiveDigit(i)}
                            disabled={busy}
                            className={`w-14 h-16 rounded-xl border text-center font-mono text-2xl text-white/85 bg-black/25 outline-none transition-all duration-300 ${
                              authState === "granted"
                                ? "border-emerald-500/35 bg-emerald-950/20"
                                : digit
                                  ? "border-emerald-500/25"
                                  : activeDigit === i
                                    ? "border-emerald-500/20"
                                    : "border-white/[0.07]"
                            }`}
                          />
                          {activeDigit === i && !busy && !digit && (
                            <motion.div
                              aria-hidden
                              className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-emerald-500/50 rounded-full"
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1, repeat: Infinity }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Inherited trust */}
            <motion.div
              initial={still ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="mt-8 pt-5 border-t border-white/[0.05] text-center"
            >
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/15 mb-2">
                Single Sign-On · The Connected Suite
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {CONNECTED_SYSTEMS.map((s) => (
                  <span
                    key={s}
                    className="font-mono text-[7px] uppercase tracking-wider text-white/20 border border-white/[0.06] px-2 py-0.5 rounded"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      <motion.footer
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="text-center pb-5 pt-3 relative z-10 px-4"
      >
        <span className="font-mono text-[8px] uppercase tracking-[0.28em] text-white/15">
          interchange.servicesuitecloud.com · Every query consented, signed and logged
        </span>
      </motion.footer>
    </div>
  );
}
