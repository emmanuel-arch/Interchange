import { cookies } from "next/headers";
import Shell from "@/components/shell/Shell";
import type { NavGroup } from "@/components/shell/Sidebar";
import { lenderDoorForMember } from "@/lib/lenders";
import { can, ROUTE_RIGHTS } from "@/lib/rights";
import { readSession, SESSION_COOKIE } from "@/lib/session";
import { THEME_BOOT } from "@/lib/theme/useTheme";

// The console shell. Everything behind the door lives in this route group.
//
// Behind a session: proxy.ts (Next 16's replacement for middleware.ts) redirects
// anything in this group to a door when no session cookie is present. Sessions
// come from /api/session/code (an operator's work email and access code) or
// /api/session (a member node's Ed25519 signature).
//
// Since 24 Oct 2026 this is the estate's shell (components/shell/Shell): the
// rail on the left under the lender's letterhead, the controls top right, the
// identity grip that opens the lender's other systems. Which items the rail
// carries is decided HERE, from the session's rights — the shell only draws.

const NAV: { label: string; items: { href: string; label: string; icon: NavGroup["items"][number]["icon"] }[] }[] = [
  {
    label: "Bureau",
    items: [
      { href: "/search", label: "Customer search", icon: "search" },
      { href: "/exposure", label: "Live exposure", icon: "radar" },
      { href: "/reports", label: "Report catalogue", icon: "catalogue" },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/consent", label: "Consent", icon: "consent" },
      { href: "/audit", label: "Audit trail", icon: "audit" },
      { href: "/log", label: "Message log", icon: "log" },
      { href: "/usage", label: "Usage & billing", icon: "usage" },
    ],
  },
  {
    label: "Network",
    items: [
      { href: "/directory", label: "Directory", icon: "directory" },
      { href: "/governance", label: "Governance", icon: "governance" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/score", label: "Score", icon: "score" },
      { href: "/learning", label: "Learning", icon: "learning" },
      { href: "/policy", label: "Crunch settings", icon: "policy" },
    ],
  },
];

// A route group adds no path segment, so typegen resolves this layout to "/".
export default async function ConsoleLayout({ children }: LayoutProps<"/">) {
  // A founding partner's staff keep their own letterhead once inside, so the
  // console they reached from Axe's launcher still says it is Axe's. Read from
  // the verified session — the member it acts for — not from the door.
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const lender = lenderDoorForMember(session?.member);

  const nav: NavGroup[] = NAV.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => {
      const right = ROUTE_RIGHTS[i.href];
      return !right || can(session?.rights, right);
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {/* Before first paint: the theme this person chose, so the console never
          flashes the wrong one. Only this layout renders it — the site and the
          doors keep their own single ground. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <Shell
        nav={nav}
        head={{ logo: lender?.logo ?? null, name: lender?.name ?? "The Interchange" }}
        accent={{ light: lender?.accent ?? "#0e7490", dark: lender?.glow ?? "#22d3ee" }}
        actingFor={session?.member ? `${lender?.name ?? "Member"} · ${session.member}` : session ? "the platform" : null}
        user={{
          name: session?.name ?? "Signed out",
          email: session?.email ?? null,
          role: session?.role ?? "",
          memberName: session?.member ? (lender?.name ?? session.member) : null,
          lenderSlug: lender?.slug ?? null,
          signOutTo: lender ? `/${lender.slug}` : "/signin",
        }}
      >
        {children}
      </Shell>
    </>
  );
}
