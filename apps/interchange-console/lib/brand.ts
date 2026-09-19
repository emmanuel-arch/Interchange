// ─────────────────────────────────────────────────────────────────────────────
// THE LETTERHEAD — who stands behind an Interchange document.
//
// Every field here prints on every report, invoice and brief. So nothing is
// guessed: a line that is null does not print, rather than printing a
// plausible-looking address that is not the company's.
//
// The logo is read from public/brand/ when the pack lands. PDFs are printed
// from a temp directory where relative URLs resolve to nothing, so the artwork
// is INLINED — SVG as markup, PNG as a data URI — never linked.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const PUBLIC_ORIGIN = (process.env.INTERCHANGE_PUBLIC_ORIGIN ?? "https://interchange.servicesuitecloud.com").replace(/\/+$/, "");

export type Letterhead = {
  /** Trading name, always printed. */
  name: string;
  /** Registered company that operates the Interchange. */
  legalName: string | null;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  website: string;
  companyRegistration: string | null;
  /** Kenya Revenue Authority personal identification number. */
  kraPin: string | null;
  /** Date the operating company was incorporated. */
  incorporatedOn: string | null;
  /** Office of the Data Protection Commissioner registration. */
  odpcRegistration: string | null;
};

/**
 * The operating company, as the founder supplied it on 18 September 2026
 * (plan item A2).
 *
 * These are constants, not environment variables. A company's registered name
 * and certificate number are public facts that must print identically from
 * every machine that renders a document — a letterhead that says "BirgenAI Hub"
 * in production and nothing at all from a developer's laptop is a letterhead
 * that cannot be trusted. Environment variables stay available as an override
 * for the day the company details change, and nothing more.
 *
 * `odpcRegistration` is null because the Office of the Data Protection
 * Commissioner registration has not been given. It therefore does not print,
 * rather than printing a plausible-looking number that would be a fabrication
 * on a regulated document.
 */
export const LETTERHEAD: Letterhead = {
  name: "The Interchange",
  legalName: process.env.INTERCHANGE_LEGAL_NAME ?? "BirgenAI Hub",
  addressLines: (process.env.INTERCHANGE_ADDRESS ?? "Karen, Langata District|Nairobi County, Kenya")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean),
  phone: process.env.INTERCHANGE_PHONE ?? "+254 758 517 032",
  email: process.env.INTERCHANGE_EMAIL ?? "birgen@techcrast.co.ke",
  website: process.env.INTERCHANGE_WEBSITE ?? "www.birgenai.co.ke",
  companyRegistration: process.env.INTERCHANGE_COMPANY_REG ?? "BN-MJS5BY37",
  kraPin: process.env.INTERCHANGE_KRA_PIN ?? "A016842179G",
  incorporatedOn: process.env.INTERCHANGE_INCORPORATED ?? "12 August 2025",
  odpcRegistration: process.env.INTERCHANGE_ODPC_REG ?? null,
};

// ─────────────────────────────────────────────────────────────────────────────
// WHOSE ADDRESS PRINTS ON A REPORT.
//
// The block in the top-right corner used to be the OPERATOR's, always: BirgenAI
// Hub's registered name, address, KRA PIN and website on every document the
// network rendered, whoever had asked for it and whoever was going to read it.
//
// That is the wrong party. A bureau report is pulled BY a lender, ABOUT their
// applicant, and it is filed in that lender's credit file and shown to that
// lender's risk committee. The letterhead is read as "who is telling me this",
// and the honest answer is the lender who requested it — the Interchange is the
// rail the request travelled on, and it says so in the body, on the source line
// and in the notice at the foot of the document.
//
// ── PER MEMBER, NOT A CONSTANT ───────────────────────────────────────────────
// The obvious shortcut — swap the operator's details for Micromart's — would put
// Micromart's registered address on a report Axe Capital pulled about Axe's own
// applicant. One lender's letterhead on a competitor's credit file is not a
// cosmetic mistake. So the requesting member's code selects the block, and a
// member whose details have not been recorded falls back to the operator's,
// which is exactly what every report printed before this existed.
//
// Nothing is guessed. Micromart's registration number and KRA PIN are NOT in
// this repository, so those lines are null and simply do not print — a letterhead
// that invents a plausible-looking company number on a regulated document is
// worse than a letterhead with one fewer line.
// ─────────────────────────────────────────────────────────────────────────────
const MEMBER_LETTERHEADS: Record<string, Letterhead> = {
  // Both Micromart entities — 3002 (Micromart Africa) and 3005 (Fintech) — are
  // one company at one address; the entity distinguishes the book, not the
  // premises. As supplied by the founder on 19 September 2026.
  micromart: {
    name: "Micromart Africa",
    legalName: "MICROMART AFRICA LIMITED",
    addressLines: ["Casamia, Ngong Road, Nairobi", "P.O. Box 1864-00100 Nairobi"],
    phone: "+254 20 2 736 622",
    email: "info@micromartafrica.com",
    website: "micromartafrica.com",
    companyRegistration: null,
    kraPin: null,
    incorporatedOn: null,
    odpcRegistration: null,
  },
};

/** Member code → the key in MEMBER_LETTERHEADS. */
const MEMBER_LETTERHEAD_KEY: Record<string, string> = {
  "KE/LENDER/3002": "micromart",
  "KE/LENDER/3005": "micromart",
};

/**
 * The letterhead for a document requested by this member.
 *
 * Falls back to the operator's when the member is unknown or unnamed, so a new
 * member joining the network gets a correct document on day one rather than a
 * blank corner.
 */
export function letterheadFor(memberCode: string | null | undefined): Letterhead {
  const key = memberCode ? MEMBER_LETTERHEAD_KEY[memberCode.trim().toUpperCase()] : undefined;
  return (key && MEMBER_LETTERHEADS[key]) || LETTERHEAD;
}

/** The service's own address, distinct from the company's postal one. */
export const SERVICE_HOST = PUBLIC_ORIGIN.replace(/^https?:\/\//, "");

/**
 * Brand colours, sampled from the supplied artwork rather than chosen.
 * Regenerated by scripts/build-brand-assets.ts into public/brand/palette.json.
 */
export const BRAND_COLOURS = {
  navy: "#003868",
  navyMid: "#185098",
  green: "#409828",
  greenLight: "#40A030",
  consoleGround: "#040605",
} as const;

/**
 * Candidate artwork, in order of preference.
 *
 * The derived files come first: scripts/build-brand-assets.ts cuts the supplied
 * PNGs to their own content box, and the delivered files carry roughly 20%
 * whitespace that would otherwise print as a logo floating shyly in the corner
 * of the letterhead.
 */
const LOCKUP_FILES = ["lockup-800.png", "logo-transparent.png", "logo.png"];
const MARK_FILES = ["mark-512.png", "logo-favicon.png"];

let cache: { lockup: string | null; mark: string | null } | null = null;

function load(files: string[], heightMm: number, alt: string): string | null {
  for (const f of files) {
    const path = join(process.cwd(), "public", "brand", f);
    if (!existsSync(path)) continue;
    if (f.endsWith(".svg")) {
      // Size the SVG by height and let the viewBox keep the proportions.
      const svg = readFileSync(path, "utf8").replace(/<\?xml[^>]*>/, "");
      return `<span class="lh-art" style="height:${heightMm}mm" role="img" aria-label="${alt}">${svg}</span>`;
    }
    const b64 = readFileSync(path).toString("base64");
    return `<img class="lh-art" style="height:${heightMm}mm" alt="${alt}" src="data:image/png;base64,${b64}">`;
  }
  return null;
}

/** The logo lockup for a letterhead, or null while the pack has not landed. */
export function brandArtwork(): { lockup: string | null; mark: string | null } {
  if (!cache || process.env.NODE_ENV !== "production") {
    cache = {
      lockup: load(LOCKUP_FILES, 11, "The Interchange"),
      mark: load(MARK_FILES, 9, "The Interchange"),
    };
  }
  return cache;
}
