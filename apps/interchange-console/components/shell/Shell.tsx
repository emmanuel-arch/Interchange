"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE CONSOLE CHROME — the estate's layout, at last.
//
// Until 24 Oct 2026 the Interchange was the one system in the estate with a bar
// of links across the top, a fixed dark room, and no way back to the lender's
// other systems. Now it stands like the rest: one wallpaper (the Backdrop), the
// rail down the left with the lender's letterhead in the corner, and the
// floating controls top right — background, brightness, and the identity grip
// that opens every other system at this lender's door.
//
// The server layout decides WHO sees WHAT (rights) and hands this a filtered
// tree; all that lives here is the collapse toggle and the mobile drawer.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import Sidebar, { type Letterhead, type NavGroup } from "./Sidebar";
import Backdrop from "./Backdrop";
import SkinMenu from "./SkinMenu";
import ThemeSwitch from "./ThemeSwitch";
import IdentityMenu from "./IdentityMenu";
import { ThemeProvider } from "@/lib/theme/useTheme";

/** The Interchange's own colour in the suite launcher — the floor's wash. */
const SUITE_CYAN = "#0891b2";

// The rail's collapsed state is remembered per browser. Read as an external
// store, so the first client render already has it (no flash of the open rail).
const COLLAPSE_KEY = "ix:nav-collapsed";
const collapseListeners = new Set<() => void>();
const subscribeCollapse = (fn: () => void) => {
  collapseListeners.add(fn);
  return () => collapseListeners.delete(fn);
};
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
};

export default function Shell({
  nav,
  head,
  accent,
  user,
  actingFor,
  children,
}: {
  nav: NavGroup[];
  head: Letterhead;
  /** The lender's colour for active states, per theme. Their ink in light, their highlight in dark. */
  accent: { light: string; dark: string };
  user: { name: string; email: string | null; role: string; memberName: string | null; lenderSlug: string | null; signOutTo: string };
  /** Which member this session acts for, shown on the left of the control line. */
  actingFor: string | null;
  children: ReactNode;
}) {
  const collapsed = useSyncExternalStore(subscribeCollapse, readCollapsed, () => false);
  const [drawer, setDrawer] = useState(false);
  const toggle = () => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      /* private mode: the rail simply does not stay collapsed */
    }
    collapseListeners.forEach((l) => l());
  };

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  return (
    <ThemeProvider>
      <div className="ix-shell min-h-screen text-[color:var(--ink-body)]" style={{ "--accent-light": accent.light, "--accent-dark": accent.dark } as CSSProperties}>
        <Backdrop accent={SUITE_CYAN} accent2="#22d3ee" />

        <div className="relative z-10 flex min-h-screen gap-3 px-3 pb-6 pt-3 sm:gap-5 sm:px-5 lg:gap-6 lg:px-6">
          <aside
            className={`panel sticky top-3 hidden h-[calc(100vh-1.5rem)] shrink-0 overflow-hidden rounded-2xl transition-[width] duration-200 lg:block ${
              collapsed ? "w-16" : "w-60"
            }`}
          >
            <Sidebar nav={nav} head={head} collapsed={collapsed} onToggleCollapse={toggle} />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3 flex h-10 shrink-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrawer(true)}
                  className="panel flex h-10 w-10 items-center justify-center rounded-2xl text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="h-4 w-4" />
                </button>
                {actingFor && (
                  <span className="panel hidden h-10 min-w-0 items-center gap-2 rounded-2xl px-3 text-[12px] sm:inline-flex">
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                    <span className="truncate text-[color:var(--ink-muted)]">
                      Acting for <span className="font-semibold text-[color:var(--ink)]">{actingFor}</span>
                    </span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <SkinMenu accent={SUITE_CYAN} />
                <ThemeSwitch />
                <IdentityMenu {...user} />
              </div>
            </div>

            <main className="canvas mx-auto w-full max-w-6xl flex-1 rounded-2xl px-5 py-7 sm:px-8">{children}</main>

            <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-[0.26em] text-[color:var(--ink-faint)]">
              Every query consented, signed and logged · Powered by BirgenAI
            </p>
          </div>
        </div>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div aria-hidden className="absolute inset-0 bg-[#000]/40 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <div className="sheet absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col">
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close navigation"
                className="absolute right-2 top-2 z-10 rounded-lg p-2 text-[color:var(--ink-muted)] hover:bg-[color:var(--ink)]/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="min-h-0 flex-1 pt-1">
                <Sidebar nav={nav} head={head} collapsed={false} onNavigate={() => setDrawer(false)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}
