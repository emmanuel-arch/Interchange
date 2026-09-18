// ─────────────────────────────────────────────────────────────────────────────
// THE THEATRE SURFACE — a print shell for the one report that is not ink on
// paper, and the charts that live on it.
//
// ── WHY THIS EXISTS BESIDE shell.ts RATHER THAN INSIDE IT ────────────────────
// lib/reports/theme.ts opens by saying a report is INK ON PAPER: near-white
// ground, colour spent only where it carries meaning, because a credit file is
// printed, filed and kept for years, and a dark theme costs a fortune in toner.
// That reasoning is right and it still governs every bureau document.
//
// Cashflow & Affordability is the exception, and the exception is commercial
// rather than aesthetic. It is the product the Interchange sells that no bureau
// can sell: a read of the borrower's actual money, taken from the rail itself.
// It is looked at on a screen by an officer deciding in the next two minutes,
// it is forwarded, and it is the artefact a prospective member is shown when
// deciding whether to join. The crunch theatre that produces it is already dark
// and lit; a document that drops out of that into grey columns reads like the
// exciting part has ended.
//
// So this surface exists, and it is kept HONEST rather than merely dark:
//
//   · Colour still carries meaning. Green is money in and improvement; red is
//     money out and deterioration; amber is watch. Nothing is coloured for
//     decoration, and no figure is legible only by its colour — every coloured
//     value carries its sign or its label.
//   · Contrast is measured, not felt. Body text is #E8EDEA on #060D0B (14.9:1),
//     secondary #9FB0A8 (7.4:1), and the faintest label used anywhere is
//     #7C8C85 (4.9:1) — all above the 4.5:1 floor. The green #5FD16A on ground
//     measures 8.6:1; the theatre's own #4CB749 measures 6.4:1 and is used for
//     fills rather than for type.
//   · It still prints. Backgrounds are forced with print-color-adjust, page
//     breaks are declared, and nothing depends on a hover or an animation.
//
// ── WHAT THE HEADLESS RENDERER WILL AND WILL NOT DO ─────────────────────────
// Learned the hard way on this box, and encoded here so it is not relearned:
//   · WOFF2 silently falls back to Times. The faces are WOFF v1, inlined.
//   · backdrop-filter does not composite in print. Glass is a flat rgba fill.
//   · Background images must be data URIs; a relative URL resolves to nothing
//     because the page is rendered from a temp directory.
//   · print-color-adjust: exact is REQUIRED or every panel prints white.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { esc } from "./theme";

// ── Palette ──────────────────────────────────────────────────────────────────

export const T = {
  /** The ground. Near-black with a green cast, so the brand green sits on it. */
  ground: "#060D0B",
  groundDeep: "#030706",
  /** Panel fill. Flat rgba — backdrop-filter does not survive printing. */
  glass: "rgba(255,255,255,0.055)",
  glassStrong: "rgba(255,255,255,0.085)",
  hairline: "rgba(255,255,255,0.12)",
  hairlineFaint: "rgba(255,255,255,0.07)",

  ink: "#E8EDEA",
  inkSecondary: "#9FB0A8",
  inkMuted: "#7C8C85",

  /** Money in, improvement, approval. 8.6:1 on the ground. */
  green: "#5FD16A",
  /** The theatre's own green. Fills and rules, not type. */
  greenFill: "#4CB749",
  greenDeep: "#1E8B3A",
  /** Money out, deterioration. 6.1:1 on the ground. */
  red: "#FF6B6B",
  redFill: "#E14B4B",
  /** Watch. 9.7:1 on the ground. */
  amber: "#FFC24D",
  amberFill: "#E0A02B",

  /** Brand, from the supplied artwork. Structure and identity, never status. */
  navy: "#003868",
  navyLight: "#6FA8DC",
  brandGreen: "#409828",
} as const;

/**
 * Categorical series colours for the dark ground.
 *
 * Six hues, each at least 45 in chroma so none reads grey, and each separated
 * from its neighbours by more than a just-noticeable difference under deutan
 * and protan simulation. Assigned in fixed order and never cycled — a seventh
 * category becomes "everything else" rather than reusing the first colour,
 * because a repeated colour in a legend is read as a repeated thing.
 */
export const SERIES = ["#5FD16A", "#6FA8DC", "#FFC24D", "#C792EA", "#FF8A65", "#4DD0C7"] as const;

/** Ordered magnitude, light to dark, single hue. */
export const RAMP = ["#BDECC3", "#8FDD9C", "#5FD16A", "#3AAE52", "#1E8B3A"] as const;

export const kes = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(Number(n))
    ? "—"
    : Math.round(Number(n)).toLocaleString("en-KE");

export const kesCompact = (n: number): string => {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${s}${(a / 1_000).toFixed(a >= 10_000 ? 0 : 1)}k`;
  return `${s}${Math.round(a)}`;
};

export const pct = (n: number, dp = 0): string => `${(n * 100).toFixed(dp)}%`;

// ── Assets ───────────────────────────────────────────────────────────────────

let fontCache: string | null = null;
export function fontCss(): string {
  if (fontCache === null) {
    try {
      fontCache = readFileSync(join(process.cwd(), "lib", "reports", "assets", "fonts.css"), "utf8");
    } catch {
      console.warn("[theatre] fonts.css not found — the document will render in fallback faces.");
      fontCache = "";
    }
  }
  return fontCache;
}

const dataUriCache = new Map<string, string | null>();

/**
 * A public asset as a data URI.
 *
 * Every image in this document is inlined. The PDF is rendered from a temp
 * directory by a headless browser, so `/mpesa/mpesa-background.jpg` resolves to
 * nothing and the cover prints as a black rectangle — with no error anywhere,
 * which is the failure mode that costs an afternoon.
 */
export function assetDataUri(relative: string): string | null {
  if (dataUriCache.has(relative)) return dataUriCache.get(relative)!;
  const path = join(process.cwd(), "public", relative);
  let out: string | null = null;
  if (existsSync(path)) {
    const ext = relative.split(".").pop()!.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "application/octet-stream";
    out = `data:${mime};base64,${readFileSync(path).toString("base64")}`;
  }
  dataUriCache.set(relative, out);
  return out;
}

// ── Chart primitives ─────────────────────────────────────────────────────────
//
// All SVG, all self-contained, all sized in millimetres so a chart occupies the
// space the page budget gave it rather than whatever its aspect ratio wants.

function svgWrap(w: number, h: number, body: string, heightMm: number, title: string): string {
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${heightMm}mm;display:block" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

function text(x: number, y: number, s: string, o: { size?: number; fill?: string; anchor?: string; weight?: number; mono?: boolean } = {}): string {
  const f = o.mono === false ? "Sora, sans-serif" : "'JetBrains Mono', monospace";
  return `<text x="${x}" y="${y}" font-family="${f}" font-size="${o.size ?? 11}" font-weight="${o.weight ?? 500}" fill="${o.fill ?? T.inkSecondary}" text-anchor="${o.anchor ?? "start"}" dominant-baseline="middle">${esc(s)}</text>`;
}

/**
 * The score dial.
 *
 * An arc rather than a full ring: a credit score has a floor and a ceiling and
 * a gauge says so, where a doughnut implies a share of something. The needle is
 * a wedge because a thin line disappears at print resolution.
 */
/**
 * The band name and the default rate are NOT inside this SVG.
 *
 * They were, and they collided with the scale end-labels at every size the
 * cover asked for. Text that has to flow, wrap or be re-spaced belongs in HTML,
 * where the layout engine can do it; the SVG keeps only what is geometric.
 */
export function scoreDial(value: number, min: number, max: number, band: string, heightMm = 52): string {
  const W = 320, H = 226;
  const cx = W / 2, cy = 148, r = 112;
  // A gauge opens at the BOTTOM: 210° round through the top to −30°. The first
  // cut of this used 150° → −90°, which put the gap at the lower left and made
  // a 40%-full dial read as a three-quarter-full one lying on its side.
  const span = 240;
  const start = 210;
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const pol = (deg: number, radius: number) => {
    const a = ((deg) * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)];
  };
  const arc = (from: number, to: number, radius: number, width: number, colour: string, opacity = 1) => {
    const [x0, y0] = pol(from, radius);
    const [x1, y1] = pol(to, radius);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}" />`;
  };

  const end = start - span;
  const at = start - span * frac;

  const bandColour = value >= min + (max - min) * 0.72 ? T.green : value >= min + (max - min) * 0.5 ? T.amber : T.red;

  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => {
      const deg = start - span * t;
      const [xa, ya] = pol(deg, r + 12);
      const [xb, yb] = pol(deg, r + 19);
      return `<line x1="${xa.toFixed(1)}" y1="${ya.toFixed(1)}" x2="${xb.toFixed(1)}" y2="${yb.toFixed(1)}" stroke="${T.hairline}" stroke-width="2" />`;
    })
    .join("");

  // The needle stops short of the value figure rather than running under it.
  const [nx, ny] = pol(at, r - 24);

  return svgWrap(
    W, H,
    `${arc(start, end, r, 20, "rgba(255,255,255,0.09)")}
     ${arc(start, at, r, 20, bandColour, 0.95)}
     ${ticks}
     <circle cx="${cx}" cy="${cy}" r="7" fill="${bandColour}" />
     <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${bandColour}" stroke-width="4" stroke-linecap="round" />
     ${text(cx, cy - 44, String(value), { size: 54, fill: T.ink, anchor: "middle", weight: 700 })}
     ${text(cx, cy - 8, `of ${max}`, { size: 12, fill: T.inkMuted, anchor: "middle" })}
     ${text(pol(start, r)[0] - 2, pol(start, r)[1] + 24, String(min), { size: 11, fill: T.inkMuted, anchor: "middle" })}
     ${text(pol(end, r)[0] + 2, pol(end, r)[1] + 24, String(max), { size: 11, fill: T.inkMuted, anchor: "middle" })}`,
    heightMm,
    `Statement score ${value} of ${max}, ${band}`,
  );
}

export type MonthBar = { label: string; income: number; outflow: number; borrowed: number; net: number; active: boolean };

/**
 * Money in and money out, month by month, with the average-income line.
 *
 * The average line is the point of the chart. It is drawn at the figure the
 * HEADLINE uses, so a reader can see at a glance which months carried the
 * average and which were carried by the others — and can check that the line
 * sits where the cover page says it does.
 */
export function incomeExpenditureChart(
  months: MonthBar[],
  avgIncome: number,
  opts: { heightMm?: number; avgLabel?: string } = {},
): string {
  const W = 1000, H = 360;
  const padL = 62, padR = 20, padT = 26, padB = 52;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  if (!months.length) return svgWrap(W, H, text(W / 2, H / 2, "No months in this period", { anchor: "middle", fill: T.inkMuted }), opts.heightMm ?? 58, "No data");

  const top = Math.max(avgIncome, ...months.map((m) => Math.max(m.income, m.outflow))) * 1.14 || 1;
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const slot = plotW / months.length;
  const barW = Math.min(26, slot * 0.3);
  const gap = 4;

  // Gridlines at four steps, labelled compactly so the axis does not shout.
  const steps = 4;
  const grid = Array.from({ length: steps + 1 }, (_, i) => {
    const v = (top / steps) * i;
    const yy = y(v);
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="${T.hairlineFaint}" stroke-width="1" />
            ${text(padL - 10, yy, kesCompact(v), { size: 12, anchor: "end", fill: T.inkMuted })}`;
  }).join("");

  const bars = months
    .map((m, i) => {
      const cx = padL + slot * i + slot / 2;
      const xIn = cx - barW - gap / 2;
      const xOut = cx + gap / 2;
      const hIn = Math.max(0, padT + plotH - y(m.income));
      const hOut = Math.max(0, padT + plotH - y(m.outflow));
      // The borrowed portion is drawn INSIDE the income bar, not beside it:
      // borrowing is part of what came in, and putting it alongside would
      // double the apparent inflow.
      const hBorrow = m.income > 0 ? Math.min(hIn, (m.borrowed / top) * plotH) : 0;
      const dim = m.active ? 1 : 0.28;
      return `<g opacity="${dim}">
        <rect x="${xIn.toFixed(1)}" y="${y(m.income).toFixed(1)}" width="${barW}" height="${hIn.toFixed(1)}" rx="3" fill="${T.greenFill}" opacity="0.92" />
        ${hBorrow > 2 ? `<rect x="${xIn.toFixed(1)}" y="${(padT + plotH - hBorrow).toFixed(1)}" width="${barW}" height="${hBorrow.toFixed(1)}" rx="3" fill="${T.amberFill}" opacity="0.95" />` : ""}
        <rect x="${xOut.toFixed(1)}" y="${y(m.outflow).toFixed(1)}" width="${barW}" height="${hOut.toFixed(1)}" rx="3" fill="${T.redFill}" opacity="0.8" />
        ${text(cx, H - padB + 18, m.label, { size: 12, anchor: "middle", fill: m.active ? T.inkSecondary : T.inkMuted })}
        ${m.active ? "" : text(cx, H - padB + 34, "no activity", { size: 9, anchor: "middle", fill: T.inkMuted })}
      </g>`;
    })
    .join("");

  const avgY = y(avgIncome);
  const avgLine = `
    <line x1="${padL}" y1="${avgY.toFixed(1)}" x2="${W - padR}" y2="${avgY.toFixed(1)}" stroke="${T.navyLight}" stroke-width="2.5" stroke-dasharray="9 6" />
    <rect x="${W - padR - 214}" y="${(avgY - 30).toFixed(1)}" width="214" height="24" rx="6" fill="${T.navy}" opacity="0.92" />
    ${text(W - padR - 204, avgY - 18, `${opts.avgLabel ?? "Avg income"} ${kes(avgIncome)}`, { size: 13, fill: "#DCEBFA", weight: 600 })}`;

  const legend = `
    <g>
      <rect x="${padL}" y="6" width="11" height="11" rx="2.5" fill="${T.greenFill}" />
      ${text(padL + 18, 12, "Money in", { size: 12, fill: T.inkSecondary })}
      <rect x="${padL + 105}" y="6" width="11" height="11" rx="2.5" fill="${T.amberFill}" />
      ${text(padL + 123, 12, "of which borrowed", { size: 12, fill: T.inkSecondary })}
      <rect x="${padL + 272}" y="6" width="11" height="11" rx="2.5" fill="${T.redFill}" />
      ${text(padL + 290, 12, "Money out", { size: 12, fill: T.inkSecondary })}
    </g>`;

  return svgWrap(W, H, `${grid}${legend}${bars}${avgLine}`, opts.heightMm ?? 62, "Monthly money in and money out against average income");
}

/** Net position per month: the bar that tells an officer whether this works. */
export function netCashflowChart(months: { label: string; net: number; active: boolean }[], heightMm = 34): string {
  const W = 1000, H = 190;
  const padL = 62, padR = 20, padT = 14, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  if (!months.length) return svgWrap(W, H, "", heightMm, "No data");
  const mag = Math.max(1, ...months.map((m) => Math.abs(m.net)));
  const zero = padT + plotH / 2;
  const slot = plotW / months.length;
  const barW = Math.min(30, slot * 0.52);

  const bars = months
    .map((m, i) => {
      const cx = padL + slot * i + slot / 2;
      const h = (Math.abs(m.net) / mag) * (plotH / 2 - 6);
      const up = m.net >= 0;
      return `<g opacity="${m.active ? 1 : 0.3}">
        <rect x="${(cx - barW / 2).toFixed(1)}" y="${(up ? zero - h : zero).toFixed(1)}" width="${barW}" height="${Math.max(2, h).toFixed(1)}" rx="3" fill="${up ? T.greenFill : T.redFill}" />
        ${text(cx, H - padB + 14, m.label, { size: 11, anchor: "middle", fill: T.inkMuted })}
      </g>`;
    })
    .join("");

  return svgWrap(
    W, H,
    `<line x1="${padL}" y1="${zero}" x2="${W - padR}" y2="${zero}" stroke="${T.hairline}" stroke-width="1.5" />
     ${text(padL - 10, zero, "0", { size: 11, anchor: "end", fill: T.inkMuted })}
     ${text(padL - 10, padT + 6, kesCompact(mag), { size: 11, anchor: "end", fill: T.inkMuted })}
     ${text(padL - 10, padT + plotH - 6, `-${kesCompact(mag)}`, { size: 11, anchor: "end", fill: T.inkMuted })}
     ${bars}`,
    heightMm,
    "Net cashflow by month",
  );
}

/** A horizontal ranked bar list. Used for spend categories and lenders. */
export function rankedBars(
  rows: { label: string; value: number; sub?: string; colour?: string }[],
  opts: { heightMm?: number; max?: number; valueFormat?: (n: number) => string } = {},
): string {
  if (!rows.length) return "";
  const rowH = 38, W = 1000;
  const H = rows.length * rowH + 8;
  const labelW = 300, valueW = 128;
  const trackX = labelW + 12;
  const trackW = W - trackX - valueW - 10;
  const max = opts.max ?? (Math.max(...rows.map((r) => Math.abs(r.value))) || 1);
  const fmt = opts.valueFormat ?? ((n: number) => kes(n));

  const body = rows
    .map((r, i) => {
      const y = i * rowH + 6;
      const w = Math.max(3, (Math.abs(r.value) / max) * trackW);
      const colour = r.colour ?? SERIES[i % SERIES.length];
      return `<g>
        ${text(0, y + 13, r.label.length > 38 ? r.label.slice(0, 37) + "…" : r.label, { size: 13, fill: T.ink, weight: 600 })}
        ${r.sub ? text(0, y + 29, r.sub.length > 46 ? r.sub.slice(0, 45) + "…" : r.sub, { size: 11, fill: T.inkMuted }) : ""}
        <rect x="${trackX}" y="${y + 8}" width="${trackW}" height="14" rx="7" fill="rgba(255,255,255,0.05)" />
        <rect x="${trackX}" y="${y + 8}" width="${w.toFixed(1)}" height="14" rx="7" fill="${colour}" />
        ${text(W, y + 15, fmt(r.value), { size: 14, anchor: "end", fill: T.ink, weight: 600 })}
      </g>`;
    })
    .join("");

  return svgWrap(W, H, body, opts.heightMm ?? (rows.length * 5.4 + 2), "Ranked bars");
}

/**
 * A driver bar: a value that can be positive or negative around a centre line,
 * with the driver's own maximum drawn as the track.
 *
 * Showing the track matters. "−78" means nothing on its own; "−78 out of a
 * possible −80" says the driver is at its floor and no further deterioration
 * in that factor can move the score.
 */
export function driverBars(
  rows: { title: string; points: number; weight: number; detail: string; enabled: boolean }[],
  heightMm?: number,
): string {
  const rowH = 46, W = 1000;
  const H = rows.length * rowH + 6;
  const centre = 560;
  const half = 300;
  const maxWeight = Math.max(1, ...rows.map((r) => r.weight));

  const body = rows
    .map((r, i) => {
      const y = i * rowH + 6;
      const w = (Math.abs(r.points) / maxWeight) * half;
      const track = (r.weight / maxWeight) * half;
      const up = r.points >= 0;
      const colour = !r.enabled ? T.inkMuted : up ? T.greenFill : T.redFill;
      return `<g opacity="${r.enabled ? 1 : 0.45}">
        ${text(0, y + 13, r.title, { size: 14, fill: T.ink, weight: 600 })}
        ${text(0, y + 31, r.detail.length > 72 ? r.detail.slice(0, 71) + "…" : r.detail, { size: 11, fill: T.inkMuted })}
        <rect x="${centre - track}" y="${y + 6}" width="${track * 2}" height="16" rx="8" fill="rgba(255,255,255,0.045)" />
        <line x1="${centre}" y1="${y + 2}" x2="${centre}" y2="${y + 26}" stroke="${T.hairline}" stroke-width="1.5" />
        <rect x="${(up ? centre : centre - w).toFixed(1)}" y="${y + 6}" width="${Math.max(2, w).toFixed(1)}" height="16" rx="8" fill="${colour}" />
        ${text(W, y + 14, r.enabled ? `${up ? "+" : ""}${r.points}` : "off", { size: 15, anchor: "end", fill: colour, weight: 700 })}
        ${text(W, y + 31, r.enabled ? `weight ${r.weight}` : "not scored", { size: 10, anchor: "end", fill: T.inkMuted })}
      </g>`;
    })
    .join("");

  return svgWrap(W, H, body, heightMm ?? rows.length * 6.6 + 1, "What moved the score");
}

/** A stacked proportion bar with its own legend beneath. */
export function compositionBar(
  parts: { label: string; value: number; colour?: string }[],
  opts: { heightMm?: number; note?: string } = {},
): string {
  const kept = parts.filter((p) => p.value > 0);
  const total = kept.reduce((s, p) => s + p.value, 0) || 1;
  const W = 1000;
  const barH = 40;
  const cols = 3;
  const legendRows = Math.ceil(kept.length / cols);
  const H = barH + 18 + legendRows * 30;

  let x = 0;
  const segs = kept
    .map((p, i) => {
      const w = (p.value / total) * W;
      const colour = p.colour ?? SERIES[i % SERIES.length];
      // A 2px gap between fills so adjacent segments read as separate without
      // a stroke, which would tint every colour toward the ground.
      const seg = `<rect x="${x.toFixed(1)}" y="0" width="${Math.max(0, w - 2).toFixed(1)}" height="${barH}" rx="4" fill="${colour}" />`;
      x += w;
      return seg;
    })
    .join("");

  const legend = kept
    .map((p, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const lx = col * (W / cols), ly = barH + 26 + row * 30;
      const colour = p.colour ?? SERIES[i % SERIES.length];
      return `<rect x="${lx}" y="${ly - 7}" width="12" height="12" rx="3" fill="${colour}" />
              ${text(lx + 20, ly, `${p.label}`, { size: 13, fill: T.inkSecondary })}
              ${text(lx + (W / cols) - 20, ly, `${pct(p.value / total)} · ${kes(p.value)}`, { size: 12, anchor: "end", fill: T.ink, weight: 600 })}`;
    })
    .join("");

  return svgWrap(W, H, `${segs}${legend}`, opts.heightMm ?? (H / W) * 176 * 0.55, "Composition");
}

/**
 * A commitment calendar: one column per month, one row per lender, shaded by
 * how much was paid. This is the picture that shows stacking — five lenders
 * all live in the same month is a different risk from five lenders spread
 * across a year, and a table of totals cannot tell them apart.
 */
export function commitmentGrid(
  lenders: { name: string; byMonth: number[] }[],
  monthLabels: string[],
  heightMm?: number,
): string {
  if (!lenders.length || !monthLabels.length) return "";
  const W = 1000;
  const labelW = 250;
  const cellW = (W - labelW) / monthLabels.length;
  const cellH = 26;
  const H = lenders.length * cellH + 34;

  const head = monthLabels
    .map((m, i) => text(labelW + cellW * i + cellW / 2, 12, m, { size: 10, anchor: "middle", fill: T.inkMuted }))
    .join("");

  // Shaded WITHIN each row, not across the grid.
  //
  // Normalised globally, Fuliza's KES 238,008 sets the scale and the other
  // eleven lenders all render as the palest step — a grid where ten of twelve
  // rows are indistinguishable says nothing. Each lender is instead shaded
  // against its own busiest month, so the picture answers the question the grid
  // is for: WHEN is each commitment live, and do they bunch. How much each one
  // costs is already a column on the previous page.
  const rows = lenders
    .map((l, r) => {
      const y = 26 + r * cellH;
      const rowMax = Math.max(1, ...l.byMonth);
      const cells = l.byMonth
        .map((v, i) => {
          const t = v / rowMax;
          const colour = v === 0 ? "rgba(255,255,255,0.035)" : RAMP[Math.min(RAMP.length - 1, Math.floor(t * (RAMP.length - 0.001)))];
          return `<rect x="${(labelW + cellW * i + 1.5).toFixed(1)}" y="${y + 2}" width="${(cellW - 3).toFixed(1)}" height="${cellH - 5}" rx="3" fill="${colour}" />`;
        })
        .join("");
      return `${text(0, y + cellH / 2, l.name.length > 30 ? l.name.slice(0, 29) + "…" : l.name, { size: 12, fill: T.ink })}${cells}`;
    })
    .join("");

  return svgWrap(W, H, `${head}${rows}`, heightMm ?? lenders.length * 3.8 + 6, "Which lender was paid in which month");
}

// ── The page shell ───────────────────────────────────────────────────────────

export type TheatrePage = { body: string; /** Suppress the running header. */ cover?: boolean };

export type TheatreDoc = {
  title: string;
  subtitle: string;
  reference: string;
  reportDate: string;
  footerLeft: string;
  pages: TheatrePage[];
  /** Printed diagonally across every page when set. */
  watermark?: string;
};

export function css(): string {
  const bg = assetDataUri("mpesa/mpesa-background.jpg");
  return `
${fontCss()}

/* THE PRINT CONTRACT.
   print-color-adjust is not optional: without it every panel, bar and fill on
   this document prints as white paper and the report arrives blank-looking. */
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

@page {
  size: A4 portrait;
  margin: 0;
}

html, body {
  margin: 0; padding: 0;
  background: ${T.groundDeep};
  color: ${T.ink};
  font-family: 'Sora', system-ui, sans-serif;
  font-size: 9.6pt;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.page {
  position: relative;
  width: 210mm;
  height: 297mm;
  padding: 14mm 15mm 15mm;
  background: ${T.ground};
  overflow: hidden;
  page-break-after: always;
  break-after: page;
  display: flex;
  flex-direction: column;
}
.page:last-child { page-break-after: auto; break-after: auto; }

/* A single hairline of brand colour down the left edge of every page. It is the
   cheapest possible way to make a stack of loose pages read as one document. */
.page::before {
  content: "";
  position: absolute; left: 0; top: 0; bottom: 0; width: 3.2mm;
  background: linear-gradient(180deg, ${T.navy} 0%, ${T.brandGreen} 100%);
}

.page.cover {
  padding-top: 0;
  ${bg ? `background-image: linear-gradient(180deg, rgba(3,7,6,0.72) 0%, rgba(3,7,6,0.90) 46%, ${T.ground} 82%), url('${bg}');` : ""}
  background-size: cover;
  background-position: center 22%;
}

.run {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8mm; padding-bottom: 3mm; margin-bottom: 5mm;
  border-bottom: 1px solid ${T.hairlineFaint};
  flex: 0 0 auto;
}
.run .who { display: flex; align-items: center; gap: 3mm; }
.run img.mark { height: 7mm; width: 7mm; object-fit: contain; }
.run .word { font-family: 'JetBrains Mono', monospace; font-size: 7.4pt; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; color: ${T.inkSecondary}; }
.run .ctx { font-family: 'JetBrains Mono', monospace; font-size: 7pt; color: ${T.inkMuted}; letter-spacing: .05em; text-align: right; }

.foot {
  margin-top: auto; padding-top: 3mm;
  border-top: 1px solid ${T.hairlineFaint};
  display: flex; align-items: center; justify-content: space-between; gap: 6mm;
  font-family: 'JetBrains Mono', monospace; font-size: 6.6pt; color: ${T.inkMuted};
  letter-spacing: .04em; flex: 0 0 auto;
}

.flow { flex: 1 1 auto; min-height: 0; }

h1 { font-size: 30pt; font-weight: 700; line-height: 1.08; letter-spacing: -0.02em; margin: 0; color: #fff; }
h2 { font-size: 14pt; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 3mm; color: #fff; }
h3 { font-size: 10.5pt; font-weight: 600; margin: 0 0 1.6mm; color: ${T.ink}; }
p { margin: 0 0 2.6mm; color: ${T.inkSecondary}; }
strong { color: ${T.ink}; font-weight: 600; }
.lead { font-size: 11pt; line-height: 1.55; color: ${T.ink}; }

.eyebrow {
  font-family: 'JetBrains Mono', monospace; font-size: 7pt; font-weight: 700;
  letter-spacing: .22em; text-transform: uppercase; color: ${T.greenFill};
  margin-bottom: 2.5mm;
}
.eyebrow.muted { color: ${T.inkMuted}; }

.panel {
  background: ${T.glass};
  border: 1px solid ${T.hairline};
  border-radius: 4mm;
  padding: 5mm;
  break-inside: avoid;
}
.panel + .panel { margin-top: 4mm; }
.panel.tight { padding: 4mm; }
.panel.flat { background: rgba(255,255,255,0.03); }

.grid { display: grid; gap: 4mm; }
.g2 { grid-template-columns: 1fr 1fr; }
.g3 { grid-template-columns: repeat(3, 1fr); }
.g4 { grid-template-columns: repeat(4, 1fr); }
.split { display: grid; grid-template-columns: 1.15fr 1fr; gap: 5mm; align-items: start; }

.tile { background: ${T.glass}; border: 1px solid ${T.hairline}; border-radius: 3.4mm; padding: 3.6mm 4mm; }
.tile .k { font-family: 'JetBrains Mono', monospace; font-size: 6.6pt; letter-spacing: .14em; text-transform: uppercase; color: ${T.inkMuted}; }
.tile .v { font-family: 'JetBrains Mono', monospace; font-size: 15pt; font-weight: 700; margin-top: 1.4mm; color: ${T.ink}; font-variant-numeric: tabular-nums; }
.tile .s { font-size: 7.6pt; color: ${T.inkMuted}; margin-top: 0.8mm; line-height: 1.35; }
.tile.hero { background: linear-gradient(135deg, rgba(76,183,73,0.20), rgba(30,139,58,0.10)); border-color: rgba(95,209,106,0.42); }
.tile.hero .v { color: ${T.green}; font-size: 18pt; }
.tile.warn { border-color: rgba(255,194,77,0.38); background: rgba(255,194,77,0.08); }
.tile.warn .v { color: ${T.amber}; }
.tile.bad { border-color: rgba(255,107,107,0.38); background: rgba(255,107,107,0.08); }
.tile.bad .v { color: ${T.red}; }

table { width: 100%; border-collapse: collapse; font-size: 8.4pt; }
th {
  text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 6.6pt;
  letter-spacing: .13em; text-transform: uppercase; color: ${T.inkMuted};
  font-weight: 500; padding: 0 2.4mm 2mm 0; border-bottom: 1px solid ${T.hairline};
}
td { padding: 2.1mm 2.4mm 2.1mm 0; border-bottom: 1px solid ${T.hairlineFaint}; vertical-align: top; color: ${T.inkSecondary}; }
tr:last-child td { border-bottom: none; }
td.n, th.n { text-align: right; font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.name { color: ${T.ink}; font-weight: 600; }
td .sub { display: block; font-size: 7.2pt; color: ${T.inkMuted}; font-weight: 400; margin-top: 0.5mm; line-height: 1.35; }

.chip {
  display: inline-block; padding: 0.7mm 2mm; border-radius: 1.6mm;
  font-family: 'JetBrains Mono', monospace; font-size: 6.4pt; font-weight: 600;
  letter-spacing: .08em; text-transform: uppercase; white-space: nowrap;
}
.chip.good { background: rgba(95,209,106,0.16); color: ${T.green}; border: 1px solid rgba(95,209,106,0.34); }
.chip.watch { background: rgba(255,194,77,0.14); color: ${T.amber}; border: 1px solid rgba(255,194,77,0.32); }
.chip.bad { background: rgba(255,107,107,0.14); color: ${T.red}; border: 1px solid rgba(255,107,107,0.32); }
.chip.info { background: rgba(111,168,220,0.14); color: ${T.navyLight}; border: 1px solid rgba(111,168,220,0.32); }
.chip.mute { background: rgba(255,255,255,0.05); color: ${T.inkMuted}; border: 1px solid ${T.hairline}; }

.flag { display: flex; gap: 3mm; padding: 2.6mm 0; border-bottom: 1px solid ${T.hairlineFaint}; }
.flag:last-child { border-bottom: none; }
.flag .dot { width: 2.4mm; height: 2.4mm; border-radius: 50%; margin-top: 1.4mm; flex: 0 0 auto; }
.flag .t { font-weight: 600; color: ${T.ink}; font-size: 9pt; }
.flag .d { font-size: 8pt; color: ${T.inkSecondary}; line-height: 1.45; margin-top: 0.4mm; }

.note {
  font-size: 7.6pt; color: ${T.inkMuted}; line-height: 1.5;
  border-left: 2px solid ${T.hairline}; padding-left: 3mm;
}
.source { font-family: 'JetBrains Mono', monospace; font-size: 6.4pt; color: ${T.inkMuted}; letter-spacing: .05em; margin-top: 2.4mm; }

.step { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; padding: 2.1mm 0; border-bottom: 1px dashed ${T.hairlineFaint}; }
.step:last-child { border-bottom: none; }
.step .l { color: ${T.ink}; font-weight: 600; font-size: 8.6pt; }
.step .l small { display: block; font-weight: 400; color: ${T.inkMuted}; font-size: 7.3pt; line-height: 1.4; margin-top: 0.4mm; max-width: 108mm; }
.step .v { font-family: 'JetBrains Mono', monospace; font-size: 11pt; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.step.total { border-top: 1.5px solid ${T.hairline}; border-bottom: none; margin-top: 1.5mm; padding-top: 3mm; }
.step.total .v { font-size: 15pt; color: ${T.green}; }
.step.total.zero .v { color: ${T.red}; }

.wm {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: 'JetBrains Mono', monospace; font-size: 46pt; font-weight: 700;
  letter-spacing: .3em; color: rgba(255,255,255,0.045);
  transform: rotate(-32deg); pointer-events: none; z-index: 0;
}
.page > *:not(.wm) { position: relative; z-index: 1; }
`;
}

export function renderTheatreDoc(doc: TheatreDoc): string {
  const mark = assetDataUri("brand/mark-192.png");
  const total = doc.pages.length;

  const pages = doc.pages
    .map((p, i) => {
      const n = i + 1;
      const running = p.cover
        ? ""
        : `<div class="run">
             <div class="who">${mark ? `<img class="mark" src="${mark}" alt="">` : ""}<span class="word">Interchange</span></div>
             <div class="ctx">${esc(doc.title)} · ${esc(doc.reference)}</div>
           </div>`;
      return `<section class="page${p.cover ? " cover" : ""}">
        ${doc.watermark ? `<div class="wm">${esc(doc.watermark)}</div>` : ""}
        ${running}
        <div class="flow">${p.body}</div>
        <div class="foot"><span>${esc(doc.footerLeft)}</span><span>Page ${n} of ${total}</span></div>
      </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(doc.title)} · ${esc(doc.reference)}</title>
<style>${css()}</style>
</head><body>
${pages}
</body></html>`;
}
