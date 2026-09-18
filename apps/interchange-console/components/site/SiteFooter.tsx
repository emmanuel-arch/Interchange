import Link from "next/link";
import { InterchangeMark } from "@/components/chrome";
import { DISCLAIMER_SHORT } from "@/lib/site/facts";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#products", label: "Reports" },
      { href: "/#bureau", label: "Bureau Direct" },
      { href: "/#crunch", label: "Statement Crunch" },
      { href: "/#exposure", label: "Live exposure" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "API reference" },
      { href: "/docs#authentication", label: "Authentication" },
      { href: "/docs#codes", label: "Code tables" },
      { href: "/docs#errors", label: "Response codes" },
    ],
  },
  {
    title: "Evidence",
    links: [
      { href: "/preview", label: "Sample documents" },
      { href: "/preview/crunch", label: "Crunch theatre" },
      { href: "/api/log/verify", label: "Verify the log" },
      { href: "/signin", label: "Member sign in" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-24 border-t border-white/[0.07]">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2.5">
            <InterchangeMark className="h-7 w-7" />
            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.26em] text-white/80">Interchange</span>
          </div>
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-white/45">
            A consent-gated exchange for Kenyan lenders. Members query each other in real time; nothing is pooled, and
            identity is destroyed at the edge before anything crosses a boundary.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <div className="inst text-[10px] text-white/35">{c.title}</div>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[13px] text-white/60 transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-start md:justify-between">
          <p className="max-w-3xl text-[11.5px] leading-relaxed text-white/35">{DISCLAIMER_SHORT}</p>
          <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">
            Every query consented, signed and logged
          </p>
        </div>
      </div>
    </footer>
  );
}
