"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE IDENTITY BUTTON — who is signed in, and the systems that identity opens.
//
// The estate's grip, as every other system carries it (connected-suite
// components/shell/IdentityMenu): one pill far right, one sheet — the person,
// the lender's systems each opened at that lender's own door, and Sign out.
// ⌘K / Ctrl-K opens it, as it does everywhere else.
//
// The Interchange is the system you are IN, so it is listed and marked HERE
// rather than hidden: a switcher that hides where you are teaches nobody the
// shape of the estate.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight, Calculator, ChartNoAxesCombined, Grip, Headphones, KeyRound, Landmark, LogOut, Smartphone, Users2, Waypoints,
} from "lucide-react";
import { ESTATE, estateHref, type EstateSystem } from "@/lib/estate";

const ICONS: Record<EstateSystem["icon"], typeof Landmark> = {
  landmark: Landmark,
  headphones: Headphones,
  chart: ChartNoAxesCombined,
  users: Users2,
  calculator: Calculator,
  smartphone: Smartphone,
  waypoints: Waypoints,
};

export default function IdentityMenu({
  name,
  email,
  role,
  memberName,
  lenderSlug,
  signOutTo,
}: {
  name: string;
  email: string | null;
  role: string;
  memberName: string | null;
  /** The lender whose doors the systems open at; null for a platform operator. */
  lenderSlug: string | null;
  /** Where a signed-out person lands — their lender's door here. */
  signOutTo: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  const roleLabel = role.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${name} — systems & account  (⌘K)`}
        className="panel flex h-10 items-center gap-2 rounded-2xl px-2.5 transition-colors"
      >
        <Grip className="h-4 w-4 shrink-0 text-[color:var(--ink-muted)]" />
        <span aria-hidden className="h-4 w-px shrink-0 bg-[color:var(--ink)]/10" />
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-[#fff]" style={{ backgroundColor: "var(--accent)" }}>
          {initial}
        </span>
      </button>

      {open && (
        <div role="menu" className="sheet absolute right-0 top-full z-50 mt-2 w-[min(22.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl">
          <div className="flex items-center gap-3 border-b border-[color:var(--ink)]/[0.07] px-3.5 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#fff]" style={{ backgroundColor: "var(--accent)" }}>
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-[color:var(--ink)]">{name}</p>
              <p className="truncate text-[11px] text-[color:var(--ink-muted)]">
                {roleLabel}
                {memberName ? ` · ${memberName}` : " · Platform"}
              </p>
              {email && <p className="truncate text-[10.5px] text-[color:var(--ink-faint)]">{email}</p>}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 px-3.5 pb-1 pt-2.5">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
              <KeyRound className="h-3 w-3" style={{ color: "var(--accent)" }} /> BirgenAI ID
            </span>
            <span className="text-[10px] text-[color:var(--ink-faint)]">one login · every system</span>
          </div>

          <div className="max-h-[46vh] overflow-y-auto p-1.5">
            {ESTATE.map((sys) => {
              const Icon = ICONS[sys.icon];
              const here = sys.id === "interchange";
              const href = estateHref(sys, lenderSlug);
              return (
                <a
                  key={sys.id}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`group flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors ${
                    here ? "bg-[color:var(--ink)]/[0.05]" : "hover:bg-[color:var(--ink)]/[0.04]"
                  }`}
                >
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${sys.accent}1f`, color: sys.accent, boxShadow: `inset 0 0 0 1px ${sys.accent}33` }}
                  >
                    <Icon className="h-[17px] w-[17px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-[color:var(--ink)]">{sys.name}</span>
                      {here && (
                        <span className="rounded bg-[color:var(--ink)]/[0.08] px-1.5 py-px text-[9px] font-bold text-[color:var(--ink-muted)]">HERE</span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[color:var(--ink-muted)]">{sys.purpose}</span>
                  </span>
                  {!here && (
                    <ArrowUpRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-[color:var(--ink-faint)] opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </a>
              );
            })}
          </div>

          <div className="border-t border-[color:var(--ink)]/[0.07] p-1.5">
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/session", { method: "DELETE" }).catch(() => null);
                router.replace(signOutTo);
                router.refresh();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] font-medium text-red-500 transition-colors hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
