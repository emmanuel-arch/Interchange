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

/**
 * The lender's photograph for the split door — the estate's DoorArt shape
 * (connected-suite lib/suite/doors.ts). A lender without one gets the plain
 * card, never somebody else's office.
 */
export type DoorPhoto = {
  file: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  website?: string;
};

export type LenderDoor = {
  /** The path segment: interchange.…/<slug>. Matches the lender's LMS org slug. */
  slug: string;
  name: string;
  /** Every Registry member this lender is. A session for any of them belongs here. */
  members: string[];
  /** Their logo, drawn for a light ground — the gate sets it on a white plate. */
  logo: string;
  /** Their mark alone, for the door's masthead, where the logo is a lockup. */
  mark: string;
  /** The Org row's accent: their ink on paper — the door's fields and button. */
  accent: string;
  /** The colour that lights the room. Must read on #040605. */
  glow: string;
  line: string;
  /** What the member-certificate field suggests. */
  memberHint: string;
  /** The email domain their staff sign in with, for the field's example. */
  emailDomain: string;
  /** The left half of the door, where they have given us one. */
  photo: DoorPhoto | null;
};

export const LENDER_DOORS: LenderDoor[] = [
  {
    slug: "axe",
    name: "Axe Capital",
    // Boresha and Stawi. Prefixed because a bare 3003 is Micromart Check-off on
    // Micromart's server — see connected-suite lib/interchange/members.ts.
    members: ["KE/LENDER/AXE-3003", "KE/LENDER/AXE-3004"],
    logo: "/lenders/axe/logo.png",
    mark: "/lenders/axe/mark.png",
    accent: "#001247",
    // The orange of axemicroenterprise.com. Their navy (#001247) is the Org row's
    // accent, and on this ground it is indistinguishable from black.
    glow: "#ff8a00",
    line: "We provide, You Prosper.",
    memberHint: "KE/LENDER/AXE-3003",
    emailDomain: "axemicroenterprise.co.ke",
    // 24 Oct 2026 — supplied by the founder (connected-suite
    // public/lenders/axe/axe_interchange.png), built to 1400px WebP. Their own
    // banner, their own lines: "Know your borrower. Respect their data."
    photo: {
      file: "/images/doors/axe/interchange.webp",
      width: 1400,
      height: 1120,
      alt: "An Axe Capital credit officer at her desk holding an Interchange report, beside an Axe banner reading Trusted Credit Decisions",
      caption: "Trusted credit decisions · Axe Capital",
      website: "https://axemicroenterprise.com/",
    },
  },
  {
    slug: "micromart",
    name: "Micromart Africa",
    // 3005 is Fintech, the entity the LMS signs as; 3002 is the main book.
    members: ["KE/LENDER/3005", "KE/LENDER/3002"],
    logo: "/lenders/micromart/logo.png",
    mark: "/lenders/micromart/mark.png",
    accent: "#3c320b",
    // The gold of the bars. The Org row's brown is, again, black on this ground.
    glow: "#e6b422",
    line: "Flexible loans. Stronger communities.",
    memberHint: "KE/LENDER/3005",
    emailDomain: "micromartafrica.com",
    photo: null,
  },
];

/** Remembers which lender's door this browser signs in at (set by /api/session/code). */
export const DOOR_COOKIE = "interchange_door";

export function lenderDoor(slug: string | null | undefined): LenderDoor | null {
  const s = slug?.trim().toLowerCase();
  return (s && LENDER_DOORS.find((d) => d.slug === s)) || null;
}

/** The door a session for this member belongs behind, or null for the platform. */
export function lenderDoorForMember(code: string | null | undefined): LenderDoor | null {
  const c = code?.trim().toUpperCase();
  return (c && LENDER_DOORS.find((d) => d.members.includes(c))) || null;
}
