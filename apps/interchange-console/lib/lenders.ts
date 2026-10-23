// ─────────────────────────────────────────────────────────────────────────────
// The founding partners' own doors — interchange.…/axe and interchange.…/micromart.
//
// A lender's staff reach the Interchange from the app launcher in their own
// Lending Console or CallBox. Sending them to the anonymous gate at /signin took
// them out of a room in their own colours and into one in ours, with nothing to
// say the two were connected. Each partner's path wears their livery instead:
// their logo beside the Interchange mark, and the light in the room their colour.
//
// A DOOR IS NOT AN AUTHORISATION BOUNDARY. A code typed at /axe is checked exactly
// as one typed at /signin, and the session it mints acts for the operator's own
// member, whichever door they used. Refusing a correct code because it was typed
// at the wrong door would tell a caller "right code, wrong place" — the two-stage
// search lib/operator.ts deliberately refuses to offer.
//
// Nothing here is chosen. The logos are the LMS's own files (connected-suite
// public/lenders, cropped to their ink box), the glow is each lender's door
// colour in connected-suite lib/suite/doors.ts, and the line is their own.
// ─────────────────────────────────────────────────────────────────────────────

export type LenderDoor = {
  /** The path segment: interchange.…/<slug>. Matches the lender's LMS org slug. */
  slug: string;
  name: string;
  /** Every Registry member this lender is. A session for any of them belongs here. */
  members: string[];
  /** Their logo, drawn for a light ground — the gate sets it on a white plate. */
  logo: string;
  /** The colour that lights the room. Must read on #040605. */
  glow: string;
  line: string;
  /** What the member-certificate field suggests. */
  memberHint: string;
};

export const LENDER_DOORS: LenderDoor[] = [
  {
    slug: "axe",
    name: "Axe Capital",
    // Boresha and Stawi. Prefixed because a bare 3003 is Micromart Check-off on
    // Micromart's server — see connected-suite lib/interchange/members.ts.
    members: ["KE/LENDER/AXE-3003", "KE/LENDER/AXE-3004"],
    logo: "/lenders/axe/logo.png",
    // The orange of axemicroenterprise.com. Their navy (#001247) is the Org row's
    // accent, and on this ground it is indistinguishable from black.
    glow: "#ff8a00",
    line: "We provide, You Prosper.",
    memberHint: "KE/LENDER/AXE-3003",
  },
  {
    slug: "micromart",
    name: "Micromart Africa",
    // 3005 is Fintech, the entity the LMS signs as; 3002 is the main book.
    members: ["KE/LENDER/3005", "KE/LENDER/3002"],
    logo: "/lenders/micromart/logo.png",
    // The gold of the bars. The Org row's brown is, again, black on this ground.
    glow: "#e6b422",
    line: "Flexible loans. Stronger communities.",
    memberHint: "KE/LENDER/3005",
  },
];

export function lenderDoor(slug: string | null | undefined): LenderDoor | null {
  const s = slug?.trim().toLowerCase();
  return (s && LENDER_DOORS.find((d) => d.slug === s)) || null;
}

/** The door a session for this member belongs behind, or null for the platform. */
export function lenderDoorForMember(code: string | null | undefined): LenderDoor | null {
  const c = code?.trim().toUpperCase();
  return (c && LENDER_DOORS.find((d) => d.members.includes(c))) || null;
}
