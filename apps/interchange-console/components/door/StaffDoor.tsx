"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE INTERCHANGE'S STAFF DOOR — the estate's door, with an access code.
//
// The vault gate (app/member-gate.tsx) was the one sign-in in the estate that
// looked like nothing else: a black room, a choice between a certificate no
// browser holds and a bare four-digit PIN, and no name asked for. Staff who
// reached it from their Lending Console met a different product.
//
// So this is the Lending Console's door (connected-suite StaffLoginCard), field
// for field: at a lender with a photograph, the SPLIT — their room framed on the
// left, and on the right their mark and name, the system, "Staff access", then
// the WORK EMAIL they use everywhere else in the estate and, where the others
// ask for a password, the four-digit ACCESS CODE. "Powered by BirgenAI" at the
// foot. Without a photograph, the same card centred.
//
// THE EMAIL IS PART OF THE CREDENTIAL. The code alone was 10,000 guesses
// against every operator at once; an email narrows it to one operator, whose
// own lockout then means something. The server checks the pair and will not say
// which half was wrong (app/api/session/code).
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Mail, ShieldCheck, WifiOff } from "lucide-react";
import DoorField from "./DoorField";
import DoorFrame from "./DoorFrame";
import GlassButton from "./GlassButton";
import AccessSeal, { type SealState } from "./AccessSeal";
import AccessCodeInput from "./AccessCodeInput";
import type { DoorPhoto } from "@/lib/lenders";

export type DoorLender = {
  slug: string;
  name: string;
  logo: string;
  mark: string;
  accent: string;
  glow: string;
  line: string;
  emailDomain: string;
  photo: DoorPhoto | null;
};

type Problem = { title: string; body: string; tone?: "error" | "offline" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The Interchange's own colours, for the platform door at /signin. */
const PLATFORM = { accent: "#0e7490", glow: "#22d3ee" };

const SKYLINE = "/images/doors/skyline.webp";

export default function StaffDoor({ lender, next }: { lender: DoorLender | null; next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pairRefused, setPairRefused] = useState(false);
  const [focus, setFocus] = useState<"email" | "code" | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const accent = lender?.accent ?? PLATFORM.accent;
  const glow = lender?.glow ?? PLATFORM.glow;
  const example = lender ? `name@${lender.emailDomain}` : "name@company.com";

  const clear = () => {
    setProblem(null);
    setEmailErr(null);
    setPairRefused(false);
  };

  const submit = async (withCode = code) => {
    clear();
    const e = email.trim();
    if (!e) return setEmailErr("Enter your work email — the one you sign in to the other systems with.");
    if (!EMAIL_RE.test(e)) return setEmailErr(`That isn't a complete email address — it needs an @ and a domain, like ${example}.`);
    if (withCode.length !== 4) {
      setProblem({ title: "Enter your access code", body: "Your four-digit Interchange access code." });
      codeRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/session/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, code: withCode, next, door: lender?.slug ?? null }),
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!data) {
        setProblem({ title: "Can't reach the sign-in service", body: "We couldn't get an answer. Check your connection, then try again.", tone: "offline" });
        return;
      }
      if (res.ok) {
        setSealed(true);
        const to = typeof data.next === "string" ? data.next : next;
        setTimeout(() => {
          router.replace(to);
          router.refresh();
        }, 620);
        return;
      }
      const message = typeof data.message === "string" ? data.message : null;
      if (res.status === 429) {
        setProblem({ title: "Sign-in is paused for a few minutes", body: message ?? "Too many attempts. Please wait before trying again." });
      } else if (res.status === 503 || res.status === 403) {
        setProblem({ title: "Sign-in is unavailable", body: message ?? "This server cannot check access codes right now.", tone: "offline" });
      } else {
        setPairRefused(true);
        setProblem({
          title: "That email and access code don't match",
          body: "Check it's your work email, and the four digits of your Interchange access code. After five misses sign-in pauses for 15 minutes.",
        });
        setCode("");
        codeRef.current?.focus();
      }
    } catch {
      setProblem({ title: "Can't reach the sign-in service", body: "We couldn't get an answer. Check your connection, then try again.", tone: "offline" });
    } finally {
      setLoading(false);
    }
  };

  const seal: SealState = sealed
    ? "granted"
    : loading
      ? "working"
      : problem && !problem.tone
        ? "error"
        : focus === "code"
          ? "shielded"
          : focus === "email"
            ? "open"
            : "locked";

  const form = (
    <div className="step-in">
      <div className="flex items-center gap-2.5">
        <p className="text-[14px] font-semibold uppercase tracking-[0.2em]" style={{ color: accent, marginRight: "-0.2em" }}>
          Staff access
        </p>
        <AccessSeal state={seal} accent={accent} accent2={glow} size={32} />
      </div>

      {problem && (
        <div role="alert" className="door-problem step-in mt-5" data-tone={problem.tone ?? "error"}>
          {problem.tone === "offline" ? (
            <WifiOff className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={2.2} />
          ) : (
            <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={2.2} />
          )}
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold leading-snug">{problem.title}</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed opacity-90">{problem.body}</p>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-4">
        <DoorField
          label="Work email"
          icon={Mail}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailErr || pairRefused) clear();
          }}
          onFocus={() => setFocus("email")}
          onBlur={() => setFocus(null)}
          onKeyDown={(e) => e.key === "Enter" && codeRef.current?.focus()}
          inputMode="email"
          type="email"
          autoComplete="username"
          placeholder={example}
          error={emailErr}
          invalid={pairRefused}
          autoFocus
        />
        <div>
          <label htmlFor="access-code" className="door-label">
            Access code
          </label>
          <AccessCodeInput
            ref={codeRef}
            value={code}
            invalid={pairRefused}
            disabled={loading || sealed}
            onFocus={() => setFocus("code")}
            onBlur={() => setFocus(null)}
            onChange={(v) => {
              setCode(v);
              if (pairRefused) clear();
            }}
            onComplete={(c) => void submit(c)}
          />
        </div>
      </div>

      <GlassButton fill={accent} rim={glow} onClick={() => void submit()} loading={loading} trailingIcon={ArrowRight} className="mt-6">
        {sealed ? "Opening…" : loading ? "Checking" : "Sign in"}
      </GlassButton>

      <p className="mt-5 flex items-center gap-1.5 text-[11.5px] text-[#6c6c79]">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> One BirgenAI ID across the estate · every sign-in and every query audited
      </p>
    </div>
  );

  const vars = { "--brand": accent } as CSSProperties;

  // ── THE PLAIN CARD — the platform door, and a lender with no photograph ──────
  if (!lender?.photo) {
    return (
      <div className="door-light relative min-h-screen" style={vars}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SKYLINE} alt="" aria-hidden className="fixed inset-0 h-full w-full object-cover" style={{ objectPosition: "35% 40%" }} />
        <div aria-hidden className="door-veil fixed inset-0" />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
          <div className="card-rise w-full max-w-md overflow-hidden rounded-3xl bg-[#fff]/85 shadow-2xl shadow-black/10 backdrop-blur-xl">
            <div aria-hidden className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${accent}, ${glow})` }} />
            <div className="px-6 pb-7 pt-7 sm:px-8 sm:pb-8 sm:pt-8">
              <header className="flex items-center justify-center gap-3.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lender ? lender.logo : "/brand/mark-192.png"} alt={lender?.name ?? ""} className="h-14 w-auto max-w-[9rem] object-contain" />
                <span aria-hidden className="h-11 w-px bg-black/15" />
                <span className="text-left">
                  <span className="block text-[24px] font-bold leading-none tracking-[-0.02em] text-[#0c0c10]">Interchange</span>
                  <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: lender ? accent : PLATFORM.accent }}>
                    {lender ? lender.name : "Consent-gated exchange"}
                  </span>
                </span>
              </header>
              <div aria-hidden className="mx-auto mb-6 mt-5 h-px w-full max-w-[15rem]" style={{ background: `linear-gradient(90deg, transparent, ${glow}66 30%, ${accent}66 70%, transparent)` }} />
              {form}
              <p className="mt-7 text-center text-[11px] text-[#6c6c79]">
                Powered by <span className="font-semibold text-[#494955]">BirgenAI</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── THE LENDER'S OWN DOOR — the split ────────────────────────────────────────
  const photo = lender.photo;
  return (
    <div className="door-light relative min-h-screen lg:grid lg:h-screen lg:grid-cols-2 lg:overflow-hidden" style={vars}>
      <aside className="door-left relative hidden lg:flex" style={{ "--door-glow": glow } as CSSProperties}>
        <div className="relative z-10 m-auto w-full px-[7%] py-14">
          <div className="mx-auto" style={{ width: `min(100%, 1040px, calc((100dvh - 12.5rem) * ${(photo.width / photo.height).toFixed(4)}))` }}>
            <DoorFrame art={{ ...photo, glow }} />
          </div>
        </div>
      </aside>

      <main className="relative flex min-h-screen flex-col overflow-hidden lg:h-screen lg:min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SKYLINE} alt="" aria-hidden decoding="async" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "35% 40%" }} />
        <div aria-hidden className="door-veil absolute inset-0" />
        <span aria-hidden className="door-seam absolute inset-y-0 left-0 z-10 hidden w-px lg:block" style={{ "--door-glow": glow } as CSSProperties} />

        <div className="relative z-10 flex flex-1 flex-col overflow-y-auto px-6 pb-6 pt-10 sm:px-10">
          <div className="card-rise m-auto w-full max-w-[440px]" style={{ animationDelay: "40ms" }}>
            <header className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lender.mark} alt="" className="h-12 w-auto max-w-[9rem] object-contain" />
              <span aria-hidden className="h-10 w-px bg-black/15" />
              <span className="min-w-0">
                <span className="block text-[17px] font-semibold leading-tight tracking-[-0.01em] text-[#0c0c10]">{lender.name}</span>
                <span className="mt-0.5 block text-[12.5px] leading-tight text-[#494955]">{lender.line}</span>
              </span>
            </header>

            <div className="mt-9">
              <h1 className="door-system flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/mark-192.png" alt="" className="h-[0.95em] w-[0.95em] shrink-0" />
                <span className="door-system-accent" style={{ backgroundImage: `linear-gradient(100deg, ${accent} 0%, ${accent} 35%, ${glow} 130%)` }}>
                  Interchange
                </span>
              </h1>
              <div className="mt-3 flex items-center gap-3">
                <span aria-hidden className="h-1 w-10 shrink-0 rounded-full" style={{ background: glow }} />
                <p className="text-[13.5px] leading-snug text-[#494955]">Know your borrower across the market — with their consent, on the record.</p>
              </div>
            </div>

            <div className="mt-9">{form}</div>
          </div>

          <p className="mt-8 shrink-0 text-center text-[11.5px] text-[#6c6c79]">
            Powered by <span className="font-semibold text-[#2c2c34]">BirgenAI</span>
          </p>
        </div>
      </main>
    </div>
  );
}
