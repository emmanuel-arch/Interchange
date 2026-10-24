"use client";

// The left rail — the estate's shape (connected-suite components/shell/Sidebar):
// the letterhead card in the very corner, the collapse tab at its side, then the
// console's surfaces in groups. The tree arrives already filtered by the
// operator's rights; this file only draws it and marks where you are.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, BookOpen, ClipboardCheck, FileSearch, FileText, Gauge, GraduationCap, Landmark, PanelLeftClose, PanelLeftOpen,
  Radar, ReceiptText, ScrollText, Search, SlidersHorizontal, type LucideIcon,
} from "lucide-react";

export type NavIcon =
  | "search" | "radar" | "file" | "consent" | "audit" | "log" | "directory" | "governance" | "usage" | "score" | "learning" | "policy" | "catalogue";

const ICONS: Record<NavIcon, LucideIcon> = {
  search: Search,
  radar: Radar,
  file: FileText,
  consent: ClipboardCheck,
  audit: FileSearch,
  log: ScrollText,
  directory: Landmark,
  governance: BookOpen,
  usage: ReceiptText,
  score: Gauge,
  learning: GraduationCap,
  policy: SlidersHorizontal,
  catalogue: BarChart3,
};

export type NavItem = { href: string; label: string; icon: NavIcon };
export type NavGroup = { label: string; items: NavItem[] };

export type Letterhead = {
  /** The lender's logo, drawn for paper — it sits on a white card. Null for the platform. */
  logo: string | null;
  name: string;
};

function BrandBlock({ head, collapsed }: { head: Letterhead; collapsed: boolean }) {
  return (
    <Link
      href="/search"
      aria-label={`${head.name} — Interchange home`}
      title={head.name}
      className={`flex min-w-0 flex-1 shrink-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-black/[0.06] bg-[#fff] shadow-sm ${
        collapsed ? "h-12 px-1.5" : "px-3 py-3"
      }`}
    >
      {head.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={head.logo} alt={`${head.name} logo`} className={`w-full object-contain ${collapsed ? "max-h-9" : "max-h-24"}`} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/mark-192.png" alt="" className={collapsed ? "h-9 w-9" : "h-16 w-16"} />
      )}
      {!collapsed && (
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e7490]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {head.logo && <img src="/brand/mark-64.png" alt="" className="h-3.5 w-3.5" />}
          Interchange
        </span>
      )}
    </Link>
  );
}

export default function Sidebar({
  nav,
  head,
  collapsed,
  onNavigate,
  onToggleCollapse,
}: {
  nav: NavGroup[];
  head: Letterhead;
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  // Longest matching prefix wins, so exactly one item lights.
  let active: string | null = null;
  for (const g of nav)
    for (const i of g.items)
      if ((pathname === i.href || pathname.startsWith(i.href + "/")) && i.href.length > (active?.length ?? 0)) active = i.href;

  return (
    <nav aria-label="Interchange" className="flex h-full flex-col">
      <div className={`mx-2 mb-2 mt-2 flex shrink-0 gap-1.5 ${collapsed ? "flex-col" : "items-stretch"}`}>
        <BrandBlock head={head} collapsed={collapsed} />
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand" : "Collapse"}
            className={`flex shrink-0 items-center justify-center rounded-xl border border-black/[0.06] bg-[#fff] text-[#8a8a95] shadow-sm transition-colors hover:text-[#2c2c34] ${
              collapsed ? "h-8 w-full" : "w-7"
            }`}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {nav.map((g) => (
          <div key={g.label} className="mb-1">
            {!collapsed && <p className="t-label px-2.5 py-1.5">{g.label}</p>}
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = ICONS[item.icon];
                const on = item.href === active;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                      on ? "text-[#fff] shadow-sm" : "text-[color:var(--ink-body)] hover:bg-[color:var(--ink)]/[0.055] hover:text-[color:var(--ink)]"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                    style={on ? { backgroundColor: "var(--accent)" } : undefined}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${on ? "" : "text-[color:var(--ink-faint)] group-hover:text-[color:var(--ink-body)]"}`} aria-hidden />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
