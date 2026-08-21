import Link from "next/link";
import { InterchangeMark } from "@/components/chrome";

// The console shell. Everything behind the gate lives in this route group.
//
// NOT YET AUTHENTICATED — the gate's runAuth() is still a stub, so these routes
// are reachable directly. Sprint 2 puts a proxy.ts in front of this group
// (Next 16 renamed middleware → proxy) that resolves the member from their
// certificate and refuses anything without a session.

const NAV = [
  { href: "/directory", label: "Directory" },
  { href: "/consent", label: "Consent" },
  { href: "/audit", label: "Audit" },
];

// A route group adds no path segment, so typegen resolves this layout to "/".
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen flex flex-col bg-[#040605]">
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <header className="relative z-10 border-b border-white/[0.07] shrink-0">
        <div className="mx-auto max-w-[1180px] px-6 flex items-center justify-between h-14 gap-6">
          <Link href="/directory" className="flex items-center gap-2.5 shrink-0 group">
            <span className="w-8 h-8 rounded-full border border-emerald-500/25 bg-emerald-500/5 flex items-center justify-center">
              <InterchangeMark />
            </span>
            <span className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-white/80 group-hover:text-white transition-colors">
              Interchange
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-1.5 rounded-md font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 hover:text-white/85 hover:bg-white/[0.04] transition-colors"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2 shrink-0">
            <span className="w-1 h-1 rounded-full bg-emerald-500/70 animate-pulse" />
            <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/30">
              Registry online
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 mx-auto w-full max-w-[1180px] px-6 py-8">
        {children}
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] py-4 text-center shrink-0">
        <span className="font-mono text-[8px] uppercase tracking-[0.26em] text-white/15">
          Every query consented, signed and logged
        </span>
      </footer>
    </div>
  );
}
