// ─────────────────────────────────────────────────────────────────────────────
// THE ESTATE — the other systems a lender's staff move between.
//
// The Interchange was the one system in the estate with no way out: signed in
// here, a person could not get back to their Lending Console or their CallBox
// without retyping an address. Every other system carries a grip in its header
// that lists the lender's systems and opens each one at that lender's own door
// (<system>.servicesuitecloud.com/<lender>). This is the same list, in the same
// order, with the same names and accents as connected-suite lib/suite/apps.ts —
// a person who has learned the switcher there finds it unchanged here.
//
// The addresses are the estate's own structure (connected-suite
// lib/suite/links.ts → systemLink): staff systems at <label>.<domain>/<slug>,
// the customer app at microeazy.<domain>/<slug>/signin. A platform operator, who
// belongs to no lender, gets each system's front page instead.
// ─────────────────────────────────────────────────────────────────────────────

export const SUITE_DOMAIN = "servicesuitecloud.com";

export type EstateSystem = {
  id: string;
  name: string;
  purpose: string;
  accent: string;
  /** lucide icon name, resolved by the menu. */
  icon: "landmark" | "headphones" | "chart" | "users" | "calculator" | "smartphone" | "waypoints";
  /** Host label on SUITE_DOMAIN. */
  label: string;
  /** Who uses it — the customer app's door is a sign-in for borrowers. */
  audience: "staff" | "customers";
};

export const ESTATE: EstateSystem[] = [
  { id: "lms", name: "Lending Console", purpose: "Where your officers work the book, every day.", accent: "#2a78d6", icon: "landmark", label: "lms", audience: "staff" },
  { id: "callcenter", name: "CallBox Call-Center", purpose: "Every conversation, on the record.", accent: "#be123c", icon: "headphones", label: "callbox", audience: "staff" },
  { id: "analytics", name: "Analytics & Reporting", purpose: "The whole business, drawn.", accent: "#7c3aed", icon: "chart", label: "analytics", audience: "staff" },
  { id: "hr", name: "PeopleHub HR", purpose: "The people behind the book.", accent: "#6d28d9", icon: "users", label: "peoplehub", audience: "staff" },
  { id: "accounting", name: "Ledgerly Accounting", purpose: "The truth about the money.", accent: "#0f766e", icon: "calculator", label: "ledgerly", audience: "staff" },
  { id: "portal", name: "Customer Portal", purpose: "The front door your customers see.", accent: "#0e7490", icon: "smartphone", label: "microeazy", audience: "customers" },
  { id: "interchange", name: "The Interchange", purpose: "What the rest of the market already knows.", accent: "#0891b2", icon: "waypoints", label: "interchange", audience: "staff" },
];

/** Where this system opens for this lender (or for the platform, slug null). */
export function estateHref(system: EstateSystem, lenderSlug: string | null): string {
  const host = `https://${system.label}.${SUITE_DOMAIN}`;
  if (!lenderSlug) return `${host}/`;
  const s = encodeURIComponent(lenderSlug);
  if (system.id === "portal") return `${host}/${s}/signin`;
  if (system.id === "interchange") return `/directory`;
  return `${host}/${s}`;
}
