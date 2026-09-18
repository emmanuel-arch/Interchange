// ─────────────────────────────────────────────────────────────────────────────
// The numbers the public site is allowed to state, and where each came from.
//
// A public page that says "75,025" has to be able to point at the measurement.
// These are the figures from the launch brief of 16 Sep 2026, produced against
// live member books. They are dated on the page, and they change here — never
// inline in a component, where a stale number would outlive its source.
//
// Members are never named on a public page. A lender's participation in a data
// exchange is its own business to announce.
// ─────────────────────────────────────────────────────────────────────────────

export const FACTS_AS_AT = "16 September 2026";

export const FACTS = {
  membersRegistered: 17,
  booksPublished: 4,
  positionsPublished: 75_025,
  borrowersAtTwoOrMore: 2_252,
  overlapRate: "3.0%",
  bureauReportTypesEntitled: 13,
  exposureHeldKesMillions: 493,
  sampledOverlapsConfirmed: "25 of 25",
} as const;

export const NAV = [
  { href: "/#products", label: "Products" },
  { href: "/#bureau", label: "Bureau Direct" },
  { href: "/#crunch", label: "Statement Crunch" },
  { href: "/docs", label: "Developers" },
  { href: "/preview", label: "Live samples" },
] as const;

export const DISCLAIMER_SHORT =
  "The Interchange is a technology intermediary, not a credit reference bureau. Bureau information is supplied by " +
  "Metropol Credit Reference Bureau, licensed by the Central Bank of Kenya, and is presented unchanged alongside the " +
  "Interchange's reading of it. No credit opinion is given.";
