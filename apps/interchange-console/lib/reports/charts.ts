// ─────────────────────────────────────────────────────────────────────────────
// CHART PRIMITIVES — inline SVG, sized in millimetres, built for paper.
//
// Every chart in an Interchange report is hand-rolled SVG in this file. No
// charting library, and that is a decision rather than an omission:
//
//   · A PDF is rendered by a headless browser with a virtual clock. Anything
//     that measures the DOM, animates on mount, or lays itself out after first
//     paint renders as a blank box or a first frame. Library charts do all
//     three.
//   · A report is a legal artefact. The same input must produce the same bytes
//     in two years, which rules out a dependency whose defaults move.
//   · Nothing here is interactive, so the only thing a library would buy is
//     layout — and layout is the part that has to be exact on a page.
//
// ── THE RULES THESE FOLLOW ───────────────────────────────────────────────────
// Thin marks. 2px lines. Rounded data-ends anchored to the baseline. A 2px
// surface-coloured gap between adjacent fills, so segments read as separate
// without an outline. Recessive grid — hairline, never darker than the data.
// Labels in ink, never in the series colour. Direct labels on the points that
// carry the story (first, last, extremes), never on every point.
//
// ── NO HOVER LAYER, DELIBERATELY ─────────────────────────────────────────────
// An HTML chart normally ships a crosshair and tooltip. Paper cannot hover, so
// every value a reader needs is either directly labelled or present in the
// table beside the chart. That is the same accessibility obligation met by a
// different route.
// ─────────────────────────────────────────────────────────────────────────────
import { PAPER, EMERALD, SCORE_MIN, SCORE_MAX, scoreBand, esc, kesCompact } from "./theme";

const SURFACE_GAP = 2; // px, in viewBox units — the spacer between adjacent fills

/** Wrap a viewBox in a responsive <svg>. Height is set in mm so pages are predictable. */
function svg(w: number, h: number, body: string, heightMm: number, title: string): string {
  return (
    `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${heightMm}mm" preserveAspectRatio="xMidYMid meet" ` +
    `role="img" aria-label="${esc(title)}" style="display:block;overflow:visible">${body}</svg>`
  );
}

function txt(
  x: number,
  y: number,
  s: string,
  opts: { size?: number; fill?: string; anchor?: "start" | "middle" | "end"; weight?: number; mono?: boolean; spacing?: number } = {},
): string {
  const family = opts.mono === false ? "'Sora', sans-serif" : "'JetBrains Mono', monospace";
  return (
    `<text x="${x}" y="${y}" font-family="${family}" font-size="${opts.size ?? 9}" ` +
    `font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? PAPER.inkSecondary}" ` +
    `text-anchor="${opts.anchor ?? "start"}"` +
    (opts.spacing ? ` letter-spacing="${opts.spacing}"` : "") +
    `>${esc(s)}</text>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE DIAL — one number, its band, and where it sits in the range.
//
// A gauge is the right form here for the one reason gauges are usually wrong:
// the value has a FIXED, MEANINGFUL RANGE (200–900) that the reader needs to
// see. A bare number cannot show that 319 is near the floor.
// ─────────────────────────────────────────────────────────────────────────────
export function scoreDial(score: number | null, opts: { heightMm?: number; caption?: string } = {}): string {
  const W = 260;
  const H = 168;
  const cx = W / 2;
  const cy = 132;
  const r = 96;
  const stroke = 14;

  // A 180° arc. Semicircular rather than the fashionable 270° because a half
  // circle has an unambiguous left end and right end — "floor" and "ceiling".
  const pt = (frac: number, radius = r) => {
    const a = Math.PI * (1 - frac);
    return [cx + Math.cos(a) * radius, cy - Math.sin(a) * radius];
  };
  const arc = (from: number, to: number, radius = r) => {
    const [x1, y1] = pt(from, radius);
    const [x2, y2] = pt(to, radius);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  const frac = score === null ? 0 : Math.max(0, Math.min(1, (score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)));
  const band = score === null ? null : scoreBand(score);

  let body = `<path d="${arc(0, 1)}" fill="none" stroke="${PAPER.grid}" stroke-width="${stroke}" stroke-linecap="round" />`;
  if (score !== null) {
    // The filled arc alone carries the reading. An earlier version also drew a
    // marker dot at the arc's end, and at a low score — where the arc is short
    // and the stroke is thick — the dot merged with the round cap into a blob
    // that read as a rendering fault rather than as a value. The end of a
    // rounded arc is already an unambiguous position; the dot was adding
    // nothing but weight.
    body += `<path d="${arc(0, Math.max(frac, 0.008))}" fill="none" stroke="${band!.color}" stroke-width="${stroke}" stroke-linecap="round" />`;
    // A hairline tick just outside the track marks the exact point, so the
    // reading stays precise without thickening the arc.
    const [tx1, ty1] = pt(frac, r + stroke / 2 + 2);
    const [tx2, ty2] = pt(frac, r + stroke / 2 + 7);
    body += `<line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" stroke="${band!.color}" stroke-width="2" stroke-linecap="round" />`;
  }

  body += txt(cx, cy - 16, score === null ? "—" : String(Math.round(score)), {
    size: 54, weight: 700, anchor: "middle", fill: PAPER.ink,
  });
  if (band) {
    body += txt(cx, cy + 8, band.label.toUpperCase(), {
      size: 10, weight: 700, anchor: "middle", fill: band.color, spacing: 1.6,
    });
  }
  body += txt(pt(0)[0] - 2, cy + 22, String(SCORE_MIN), { size: 8.5, anchor: "middle", fill: PAPER.inkMuted });
  body += txt(pt(1)[0] + 2, cy + 22, String(SCORE_MAX), { size: 8.5, anchor: "middle", fill: PAPER.inkMuted });
  if (opts.caption) {
    body += txt(cx, 20, opts.caption.toUpperCase(), { size: 8.5, anchor: "middle", fill: PAPER.inkMuted, spacing: 1.4 });
  }

  return svg(W, H, body, opts.heightMm ?? 42, `Credit score ${score ?? "unavailable"} out of ${SCORE_MAX}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TREND LINE — one series over time, with the extremes labelled.
//
// One series, so no legend: the title names it. The y-axis does NOT start at
// zero, because a credit score has no meaningful zero and anchoring 200–900 to
// 0 would flatten every movement into a straight line. It starts at the range
// floor, which is the honest baseline for a bounded scale.
// ─────────────────────────────────────────────────────────────────────────────
export function trendLine(
  points: { label: string; value: number }[],
  opts: { heightMm?: number; min?: number; max?: number; color?: string; valueFormat?: (n: number) => string; title?: string } = {},
): string {
  const W = 620;
  const H = 200;
  const padL = 40;
  const padR = 34;
  const padT = 22;
  const padB = 34;
  const color = opts.color ?? EMERALD[4];
  const fmt = opts.valueFormat ?? ((n: number) => String(Math.round(n)));

  if (points.length === 0) return emptyPlot(W, H, opts.heightMm ?? 44, "No history reported");

  const values = points.map((p) => p.value);
  const lo = opts.min ?? Math.min(...values);
  const hi = opts.max ?? Math.max(...values);
  // A flat series would divide by zero and draw at the top of the box; give it
  // headroom so it reads as "unchanged" rather than "at maximum".
  const span = hi - lo || Math.max(1, hi * 0.1);
  const floor = opts.min ?? lo - span * 0.25;
  const ceil = opts.max ?? hi + span * 0.25;

  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(1, points.length - 1);
  const y = (v: number) => padT + (1 - (v - floor) / (ceil - floor)) * (H - padT - padB);

  let body = "";
  // Recessive grid: three hairlines, labelled, nothing more.
  for (const frac of [0, 0.5, 1]) {
    const v = floor + (ceil - floor) * frac;
    const yy = y(v);
    body += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="${PAPER.grid}" stroke-width="1" />`;
    body += txt(padL - 6, yy + 3, fmt(v), { size: 8.5, anchor: "end", fill: PAPER.inkMuted });
  }

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  // A soft area under the line gives the eye the shape without competing with
  // the line itself. 0.10 alpha keeps it under the gridlines in weight.
  body += `<path d="${line} L ${x(points.length - 1)} ${H - padB} L ${x(0)} ${H - padB} Z" fill="${color}" fill-opacity="0.10" />`;
  body += `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;

  const minI = values.indexOf(Math.min(...values));
  const maxI = values.indexOf(Math.max(...values));
  const label = new Set([0, points.length - 1, minI, maxI]);

  points.forEach((p, i) => {
    if (!label.has(i)) return;
    // 2px surface ring so a marker overlapping the line still reads as a point.
    body += `<circle cx="${x(i)}" cy="${y(p.value)}" r="5" fill="${PAPER.surface}" />`;
    body += `<circle cx="${x(i)}" cy="${y(p.value)}" r="3.4" fill="${color}" />`;
    const above = i === maxI || (i !== minI && p.value >= (values[i - 1] ?? p.value));
    body += txt(x(i), y(p.value) + (above ? -11 : 17), fmt(p.value), {
      size: 9, weight: 700, anchor: i === 0 ? "start" : i === points.length - 1 ? "end" : "middle", fill: PAPER.ink,
    });
  });

  // Tick labels thin out on their own: every other point when there are many,
  // so a 12-month axis never collides.
  const step = points.length > 8 ? 2 : 1;
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    body += txt(x(i), H - padB + 16, p.label, {
      size: 8.5, anchor: i === 0 ? "start" : i === points.length - 1 ? "end" : "middle", fill: PAPER.inkMuted,
    });
  });

  body += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="${PAPER.axis}" stroke-width="1" />`;
  return svg(W, H, body, opts.heightMm ?? 46, opts.title ?? "Trend over time");
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITION BAR — parts of one whole, in one row.
//
// Chosen over a donut on purpose. A donut asks the reader to compare angles;
// a single stacked bar asks them to compare lengths, which people do far more
// accurately, and it costs a fifth of the vertical space on a page that is
// always short of it. Every segment is directly labelled, so colour never
// carries the meaning alone.
// ─────────────────────────────────────────────────────────────────────────────
export function compositionBar(
  segments: { label: string; value: number; color: string }[],
  opts: { heightMm?: number; total?: number; unit?: string } = {},
): string {
  const W = 620;
  const barH = 30;
  const rows = Math.ceil(segments.filter((s) => s.value > 0).length / 3);
  const H = barH + 18 + rows * 20;
  const total = opts.total ?? segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return emptyPlot(W, H, opts.heightMm ?? 22, "Nothing to show");

  let x = 0;
  let body = "";
  const live = segments.filter((s) => s.value > 0);

  live.forEach((s, i) => {
    const w = (s.value / total) * W;
    const isFirst = i === 0;
    const isLast = i === live.length - 1;
    const drawW = Math.max(2, w - (isLast ? 0 : SURFACE_GAP));
    // Rounded ends on the outermost segments only: the bar is one object, and
    // rounding every segment would make it read as separate bars.
    const r = 4;
    const path =
      isFirst && isLast
        ? roundedRect(x, 0, drawW, barH, r, r, r, r)
        : isFirst
          ? roundedRect(x, 0, drawW, barH, r, 0, 0, r)
          : isLast
            ? roundedRect(x, 0, drawW, barH, 0, r, r, 0)
            : roundedRect(x, 0, drawW, barH, 0, 0, 0, 0);
    body += `<path d="${path}" fill="${s.color}" />`;
    // A count inside the segment only when it fits; otherwise the legend below
    // carries it, rather than printing a number on top of a 3px sliver.
    if (w > 46) {
      body += txt(x + drawW / 2, barH / 2 + 4, String(Math.round(s.value)), {
        size: 10, weight: 700, anchor: "middle", fill: "#ffffff",
      });
    }
    x += w;
  });

  live.forEach((s, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const lx = col * (W / 3);
    const ly = barH + 26 + row * 20;
    body += `<rect x="${lx}" y="${ly - 8}" width="9" height="9" rx="2" fill="${s.color}" />`;
    body += txt(lx + 15, ly, `${s.label}  ${Math.round(s.value)}${opts.unit ?? ""}`, {
      size: 9.5, fill: PAPER.inkSecondary,
    });
  });

  return svg(W, H, body, opts.heightMm ?? 26, "Composition");
}

function roundedRect(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number): string {
  return (
    `M ${x + tl} ${y} H ${x + w - tr} A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr} V ${y + h - br} ` +
    `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h} H ${x + bl} A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl} ` +
    `V ${y + tl} A ${tl} ${tl} 0 0 1 ${x + tl} ${y} Z`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BAR LIST — one measure across named categories.
//
// One measure means ONE colour. Colouring each bar differently would imply the
// categories are a second dimension, which is the most common chart mistake in
// a credit pack. Magnitude is carried by length; identity by the label.
// ─────────────────────────────────────────────────────────────────────────────
export function barList(
  items: { label: string; value: number; note?: string; color?: string }[],
  opts: { heightMm?: number; format?: (n: number) => string; color?: string; max?: number } = {},
): string {
  const W = 620;
  const rowH = 26;
  const labelW = 150;
  const valueW = 92;
  const H = Math.max(1, items.length) * rowH + 6;
  if (items.length === 0) return emptyPlot(W, 60, opts.heightMm ?? 18, "Nothing reported");

  const fmt = opts.format ?? ((n: number) => kesCompact(n));
  const max = opts.max ?? Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const trackW = W - labelW - valueW;

  let body = "";
  items.forEach((it, i) => {
    const y = i * rowH + 4;
    const w = Math.max(it.value > 0 ? 3 : 0, (Math.abs(it.value) / max) * trackW);
    body += txt(0, y + 15, it.label, { size: 9.5, fill: PAPER.ink, mono: false });
    body += `<rect x="${labelW}" y="${y + 5}" width="${trackW}" height="12" rx="6" fill="${PAPER.grid}" fill-opacity="0.55" />`;
    if (w > 0) body += `<path d="${roundedRect(labelW, y + 5, w, 12, 6, 6, 6, 6)}" fill="${it.color ?? opts.color ?? EMERALD[3]}" />`;
    // The qualifier is parenthesised, not just spaced: "44 1 NPA" reads as one
    // mangled figure, "44 (1 NPA)" reads as a number and a note.
    body += txt(W, y + 15, it.note ? `${fmt(it.value)} (${it.note})` : fmt(it.value), {
      size: 9.5, weight: 700, anchor: "end", fill: PAPER.ink,
    });
  });

  return svg(W, H, body, opts.heightMm ?? Math.max(12, items.length * 7), "Comparison");
}

// ─────────────────────────────────────────────────────────────────────────────
// PPI LADDER — Metropol's Payment Performance Index, M1 to M9.
//
// A bureau-specific instrument, reproduced faithfully because a lender who
// knows Metropol's report will look for it. The ramp is ordered severity, so it
// is the one-hue severity ramp interpolated across nine rungs rather than nine
// arbitrary colours.
// ─────────────────────────────────────────────────────────────────────────────
export function ppiLadder(rank: string | null, opts: { heightMm?: number } = {}): string {
  const W = 620;
  const H = 62;
  const cells = 9;
  const gap = SURFACE_GAP;
  const cellW = (W - gap * (cells - 1)) / cells;
  const active = rank ? Math.max(1, Math.min(9, Number(String(rank).replace(/\D/g, "")) || 1)) : null;

  let body = "";
  for (let i = 0; i < cells; i++) {
    const x = i * (cellW + gap);
    const on = active !== null && i + 1 <= active;
    // Rungs below the borrower's rank are filled; the rest are the empty track.
    // Severity deepens left → right, so the fill itself says how bad it is.
    const t = i / (cells - 1);
    const color = t < 0.34 ? EMERALD[2] : t < 0.67 ? "#b26a00" : "#bd382d";
    body += `<path d="${roundedRect(x, 14, cellW, 20, i === 0 ? 4 : 0, i === cells - 1 ? 4 : 0, i === cells - 1 ? 4 : 0, i === 0 ? 4 : 0)}" ` +
      `fill="${on ? color : PAPER.grid}" fill-opacity="${on ? 1 : 0.5}" />`;
    body += txt(x + cellW / 2, 48, `M${i + 1}`, {
      size: 8.5, anchor: "middle", weight: active === i + 1 ? 700 : 400,
      fill: active === i + 1 ? PAPER.ink : PAPER.inkMuted,
    });
    if (active === i + 1) {
      body += `<polygon points="${x + cellW / 2 - 5},8 ${x + cellW / 2 + 5},8 ${x + cellW / 2},13" fill="${PAPER.ink}" />`;
    }
  }
  return svg(W, H, body, opts.heightMm ?? 16, `Payment performance index ${rank ?? "unavailable"}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY STRIP — when accounts were opened, one mark per account.
//
// A dot strip rather than a histogram: with fifty accounts the individual marks
// still separate, and the reader can see clustering (six overdrafts in one
// month) that a monthly bucket would smooth away. That clustering is the
// stacking signal, which is the whole reason this chart is in the report.
// ─────────────────────────────────────────────────────────────────────────────
export function activityStrip(
  events: { date: string; weight?: number; color?: string }[],
  opts: { heightMm?: number; from?: string; to?: string } = {},
): string {
  const W = 620;
  const H = 74;
  const padL = 4;
  const padR = 4;
  const baseline = 46;

  const times = events.map((e) => Date.parse(e.date)).filter((t) => Number.isFinite(t));
  if (times.length === 0) return emptyPlot(W, H, opts.heightMm ?? 20, "No dated accounts");

  const from = opts.from ? Date.parse(opts.from) : Math.min(...times);
  const to = opts.to ? Date.parse(opts.to) : Math.max(...times);
  const span = to - from || 1;
  const x = (t: number) => padL + ((t - from) / span) * (W - padL - padR);

  let body = `<line x1="${padL}" y1="${baseline}" x2="${W - padR}" y2="${baseline}" stroke="${PAPER.axis}" stroke-width="1" />`;

  // Year ticks give the strip a scale without a full axis.
  const startYear = new Date(from).getFullYear();
  const endYear = new Date(to).getFullYear();
  for (let yr = startYear; yr <= endYear; yr++) {
    const t = Date.parse(`${yr}-01-01`);
    if (t < from || t > to) continue;
    body += `<line x1="${x(t)}" y1="${baseline - 4}" x2="${x(t)}" y2="${baseline + 4}" stroke="${PAPER.axis}" stroke-width="1" />`;
    body += txt(x(t), baseline + 18, String(yr), { size: 8.5, anchor: "middle", fill: PAPER.inkMuted });
  }

  for (const e of events) {
    const t = Date.parse(e.date);
    if (!Number.isFinite(t)) continue;
    const h = 8 + Math.min(22, (e.weight ?? 0) * 22);
    body += `<line x1="${x(t)}" y1="${baseline}" x2="${x(t)}" y2="${baseline - h}" stroke="${e.color ?? EMERALD[3]}" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.85" />`;
  }

  return svg(W, H, body, opts.heightMm ?? 20, "Accounts opened over time");
}

function emptyPlot(w: number, h: number, heightMm: number, message: string): string {
  const body =
    `<rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="${PAPER.grid}" fill-opacity="0.35" />` +
    txt(w / 2, h / 2 + 4, message.toUpperCase(), { size: 9, anchor: "middle", fill: PAPER.inkMuted, spacing: 1.4 });
  return svg(w, h, body, heightMm, message);
}

/** A tiny inline line, for putting a shape next to a number in a table row. */
export function sparkline(values: number[], opts: { color?: string; width?: number } = {}): string {
  if (values.length < 2) return "";
  const W = opts.width ?? 90;
  const H = 22;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * W) / (values.length - 1)} ${H - 3 - ((v - lo) / span) * (H - 6)}`)
    .join(" ");
  return (
    `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="vertical-align:middle" aria-hidden="true">` +
    `<path d="${d}" fill="none" stroke="${opts.color ?? EMERALD[3]}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" /></svg>`
  );
}
