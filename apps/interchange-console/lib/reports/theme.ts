// ─────────────────────────────────────────────────────────────────────────────
// THE INTERCHANGE REPORT DESIGN SYSTEM.
//
// One place where every Interchange artefact — bureau passthrough, ecosystem
// exposure, score, affordability — gets its type, colour and page furniture. A
// member should be able to tell an Interchange report from a bureau's at a
// glance, and two Interchange reports from each other only by their content.
//
// ── THIS IS A PRINT SURFACE, NOT THE CONSOLE ─────────────────────────────────
// The console is a dark vault because it is an instrument being watched. A
// report is the opposite: it is read on paper, attached to a credit file, and
// kept for years. So it is INK ON PAPER — near-white ground, dark text, colour
// spent only where it carries meaning. Printing the console's dark theme would
// cost a fortune in toner and read worse.
//
// ── THE COLOURS WERE COMPUTED, NOT CHOSEN ────────────────────────────────────
// Every palette below was run through the data-viz validator against this
// surface (#fcfcfb) before it was written down. Recorded so nobody re-picks
// them by eye:
//
//   CATEGORICAL  #00915f #2a78d6 #eb6834 #4a3aa7
//     lightness band PASS · chroma floor PASS · CVD separation PASS (worst
//     adjacent ΔE 20.6 deutan) · normal-vision ΔE 21.8 PASS · contrast ≥3:1 PASS
//     The first candidate emerald (#0b7a5f) FAILED the chroma floor at 0.1 —
//     it reads grey — which is exactly the kind of thing taste does not catch.
//
//   EMERALD ORDINAL  #74c0a4 #3cac8a #009a6e #007d59 #0b5d4e
//     monotone lightness PASS · ΔL gaps PASS · light end 2.08:1 PASS · single
//     hue (12° spread) PASS. A lighter opening step (#8fcfb8) failed at 1.74:1.
//
//   SEVERITY ORDINAL  #e0998f #d2695c #bd382d #96201a
//     monotone PASS · light end 2.24:1 PASS · single hue (1° spread) PASS.
//
// ── WHY SEVERITY IS A ONE-HUE RAMP AND NOT STATUS COLOURS ────────────────────
// The obvious move is the four status colours (good/warning/serious/critical)
// for the arrears ladder. They fail here: warning #fab219 against serious
// #ec835a measures ΔE 13.6 to NORMAL vision — below the floor of 15 — so two
// adjacent arrears buckets would be hard to tell apart for every reader, not
// only colour-blind ones. Arrears severity is ORDERED MAGNITUDE, so it gets an
// ordered one-hue ramp, which is what magnitude always gets. `good` stays a
// separate semantic colour because "no arrears" is a state, not a quantity.
// ─────────────────────────────────────────────────────────────────────────────

export const PAPER = {
  /** The chart and page surface every contrast number above was measured against. */
  surface: "#fcfcfb",
  /** The plane behind the page — only visible on screen, never printed. */
  plane: "#eeeee9",
  ink: "#0b0b0b",
  inkSecondary: "#52514e",
  inkMuted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  hairline: "rgba(11,11,11,0.10)",
  /** The blueprint's motorway green. Brand furniture — rules, mastheads, marks. */
  brand: "#0b5d4e",
  brandInk: "#084036",
} as const;

/** Identity, not magnitude. Assigned in fixed order and never cycled. */
export const CATEGORICAL = ["#00915f", "#2a78d6", "#eb6834", "#4a3aa7"] as const;

/** Magnitude in one hue, light → dark. */
export const EMERALD = ["#74c0a4", "#3cac8a", "#009a6e", "#007d59", "#0b5d4e"] as const;

/** Ordered arrears severity. Index 0 is mildest. */
export const SEVERITY = ["#e0998f", "#d2695c", "#bd382d", "#96201a"] as const;

/** States, not series. Each one always ships with a label beside it. */
export const STATE = {
  good: "#00915f",
  watch: "#b26a00",
  bad: "#bd382d",
  neutral: "#898781",
} as const;

/**
 * The arrears ladder, in the order a credit officer reads it.
 *
 * `current` is deliberately outside the severity ramp: it is the absence of
 * arrears, and colouring it as the palest shade of "late" would imply a little
 * bit of lateness.
 */
export const ARREARS_BANDS = [
  { key: "current", label: "Current", max: 0, color: STATE.good },
  { key: "1-30", label: "1–30 days", max: 30, color: SEVERITY[0] },
  { key: "31-60", label: "31–60 days", max: 60, color: SEVERITY[1] },
  { key: "61-90", label: "61–90 days", max: 90, color: SEVERITY[2] },
  { key: "90+", label: "90+ days", max: Infinity, color: SEVERITY[3] },
] as const;

export function arrearsBand(days: number) {
  return ARREARS_BANDS.find((b) => days <= b.max) ?? ARREARS_BANDS[ARREARS_BANDS.length - 1];
}

/**
 * Metropol's score runs 200–900 in their documentation and the bands below are
 * the market's reading of it, not the bureau's own cut-offs — Metropol publish
 * no band table. Labelled as an interpretation wherever it is rendered, because
 * presenting our banding as theirs would be a quiet fabrication.
 */
export const SCORE_BANDS = [
  { max: 400, label: "High risk", color: SEVERITY[3] },
  { max: 550, label: "Elevated risk", color: SEVERITY[1] },
  { max: 700, label: "Moderate", color: STATE.watch },
  { max: 800, label: "Low risk", color: EMERALD[2] },
  { max: Infinity, label: "Prime", color: PAPER.brand },
] as const;

export function scoreBand(score: number) {
  return SCORE_BANDS.find((b) => score <= b.max) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

export const SCORE_MIN = 200;
export const SCORE_MAX = 900;

/**
 * Type. Sora carries structure, Source Serif carries prose, JetBrains Mono
 * carries every figure — tabular numerals are what make a column of money
 * scannable, and a credit report is mostly columns of money.
 *
 * The faces are WOFF v1, base64-inlined from lib/reports/assets/fonts.css.
 * WOFF2 silently falls back to Times in the headless renderer.
 */
export const TYPE = {
  display: "'Sora', system-ui, sans-serif",
  body: "'Source Serif 4', Georgia, serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

/** A4 with a margin wide enough for a hole punch and a filing stamp. */
export const PAGE = {
  width: "210mm",
  height: "297mm",
  margin: "14mm",
  /** Usable width inside the margins, for sizing charts in mm. */
  contentWidthMm: 182,
} as const;

/** Money, the way a Kenyan credit file writes it. */
export function kes(amount: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return "—";
  const n = Number(amount);
  return n.toLocaleString("en-KE", {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  });
}

/** Compact money for axis ticks and tiles: 39,107 → 39.1k. */
export function kesCompact(amount: number): string {
  const n = Math.abs(amount);
  if (n >= 1_000_000) return `${(amount / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(amount / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(amount));
}

/** ISO date → "15 Sep 2026". Null-safe, because bureau dates frequently are. */
export function date(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** HTML-escape. Every value from a bureau or a member passes through this. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
