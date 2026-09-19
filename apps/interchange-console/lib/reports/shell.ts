// ─────────────────────────────────────────────────────────────────────────────
// THE REPORT SHELL — the one document every Interchange artefact is poured into.
//
// A report is DESCRIBED as blocks and RENDERED here. Nothing that assembles a
// report writes HTML: it returns a list of blocks, and this file decides what a
// panel looks like, how a table rules its rows, and where the page breaks. That
// separation is what keeps twelve report types looking like one product, and it
// is why adding a thirteenth costs a function rather than a stylesheet.
//
// ── WHAT A MEMBER IS HOLDING ─────────────────────────────────────────────────
// Every page carries the same four facts, because a credit report gets printed,
// photocopied, emailed and filed, and a loose page with no provenance is
// worthless as evidence:
//
//   WHO ASKED      the member, by name and X-Road code
//   ABOUT WHOM     the subject token — never a national ID, never a name unless
//                  the borrower consented to disclosure
//   UNDER WHAT     the consent reference the query was authorised by
//   PROVED BY      the message-log position and hash, which anybody can
//                  re-verify against the Registry
//
// ── PRINT MECHANICS THAT ARE NOT OPTIONAL ────────────────────────────────────
//   · `print-color-adjust: exact` or the renderer drops every fill to save ink,
//     and a severity ramp becomes five identical grey bars.
//   · `break-inside: avoid` on panels and table rows, or a chart lands split
//     across two pages with its legend orphaned.
//   · Fonts are WOFF v1 and base64-inlined. WOFF2 fails silently in the
//     headless build and the whole document falls back to Times.
//   · `<meta charset>` FIRST, before anything else. Rendering from file://
//     without it makes the renderer read the bytes as Windows-1252, and every
//     – · ± in the document prints as mojibake.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { join } from "path";
import { PAPER, TYPE, PAGE, STATE, esc } from "./theme";
import { LETTERHEAD, letterheadFor, brandArtwork } from "../brand";
import {
  REGULATION_40_NOTICE,
  BUREAU_DISCLAIMER_LINES,
  INTERCHANGE_BUREAU_NOTICE,
  INTERCHANGE_ECOSYSTEM_NOTICE,
  INTERCHANGE_STATEMENT_NOTICE,
  SAMPLE_NOTICE,
  SYNTHETIC_SAMPLE_NOTICE,
} from "./notices";
import { documentReference, qrSvg, verifyUrl } from "./reference";

/** The document stylesheet. One set of rules for every Interchange artefact. */
const LAYOUT_CSS = `
@page { size: A4; margin: ${PAGE.margin}; }

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  background: ${PAPER.surface};
  color: ${PAPER.ink};
  font-family: ${TYPE.body};
  font-size: 9.6pt;
  line-height: 1.5;
}
h1, h2, h3, .kpi-label, .hint, .inst { font-family: ${TYPE.display}; }
.mono, table.data td.mono, .kpi-value, .fact-value.mono { font-family: ${TYPE.mono}; font-variant-numeric: tabular-nums; }

/* ── Masthead ─────────────────────────────────────────────────────────── */
.masthead { display: flex; justify-content: space-between; align-items: flex-start; gap: 14mm;
  padding-bottom: 5mm; border-bottom: 2px solid ${PAPER.brand}; }
.brandline { display: flex; align-items: center; gap: 7px; }
.brandline .name { font-family: ${TYPE.display}; font-size: 10.5pt; font-weight: 700;
  letter-spacing: 0.22em; text-transform: uppercase; color: ${PAPER.brand}; }
.masthead h1 { font-size: 21pt; line-height: 1.1; margin: 4mm 0 1.5mm; font-weight: 700; letter-spacing: -0.015em; }
.masthead .subtitle { color: ${PAPER.inkSecondary}; font-size: 9.6pt; max-width: 105mm; margin: 0; }
.type-badge { font-family: ${TYPE.mono}; font-size: 7.6pt; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: ${PAPER.brand}; border: 1px solid ${PAPER.brand};
  border-radius: 3px; padding: 2px 6px; white-space: nowrap; }
.stamp { font-family: ${TYPE.mono}; font-size: 7.6pt; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: ${STATE.bad}; border: 1px solid ${STATE.bad};
  border-radius: 3px; padding: 2px 6px; }

/* The provenance card. Deliberately dense and monospaced — it is evidence,
   not furniture. */
.provenance { border: 1px solid ${PAPER.hairline}; border-radius: 5px; background: #fff;
  padding: 3.5mm 4mm; min-width: 68mm; }
.provenance dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 1.1mm 4mm; }
.provenance dt { font-family: ${TYPE.display}; font-size: 6.8pt; letter-spacing: 0.13em;
  text-transform: uppercase; color: ${PAPER.inkMuted}; align-self: baseline; }
/* anywhere, not break-all: a 128-character subject token must be allowed to
   break mid-string, but a person's name must not — break-all turned
   "Faith Birgen" into "Faith Birg / en".
   (No backticks in this block: it lives inside a template literal.) */
.provenance dd { margin: 0; font-family: ${TYPE.mono}; font-size: 7.6pt; color: ${PAPER.ink};
  overflow-wrap: anywhere; }

/* ── Sections ─────────────────────────────────────────────────────────── */
.section-heading { margin: 7mm 0 3mm; break-after: avoid; }
.section-heading h2 { font-size: 12.5pt; margin: 0; letter-spacing: -0.01em; }
.section-heading p { margin: 1mm 0 0; color: ${PAPER.inkSecondary}; font-size: 9pt; max-width: 150mm; }

.panel { border: 1px solid ${PAPER.hairline}; border-radius: 5px; background: #fff;
  margin: 3mm 0; break-inside: avoid; overflow: hidden; }
.panel.half { flex: 1 1 0; min-width: 0; margin: 0; }
/* A long table must flow across pages. Kept whole, a 48-row ladder is pushed
   to the next page and leaves its heading alone on an otherwise blank one. */
.panel.flow { break-inside: auto; }
table.data thead { display: table-header-group; }
.panel-head { display: flex; justify-content: space-between; align-items: baseline; gap: 6mm;
  padding: 2.6mm 4mm; border-bottom: 1px solid ${PAPER.hairline}; background: #fbfbf9; }
.panel-head h3 { margin: 0; font-size: 8pt; font-weight: 700; letter-spacing: 0.15em;
  text-transform: uppercase; color: ${PAPER.inkSecondary}; }
.hint { font-family: ${TYPE.mono}; font-size: 7.4pt; color: ${PAPER.inkMuted}; }
.panel-body { padding: 4mm; }
.row { display: flex; gap: 3mm; margin: 3mm 0; align-items: stretch; break-inside: avoid; }

/* ── KPI strip ────────────────────────────────────────────────────────── */
.kpis { display: grid; gap: 1px; background: ${PAPER.hairline}; border: 1px solid ${PAPER.hairline};
  border-radius: 5px; overflow: hidden; margin: 3mm 0; break-inside: avoid; }
.kpi { background: #fff; padding: 3.4mm 3.6mm; }
.kpi-label { font-size: 6.9pt; letter-spacing: 0.14em; text-transform: uppercase;
  color: ${PAPER.inkMuted}; margin-bottom: 1.6mm; }
.kpi-value { font-size: 16pt; font-weight: 700; line-height: 1; letter-spacing: -0.02em; }
.kpi-note { font-size: 7.6pt; color: ${PAPER.inkSecondary}; margin-top: 1.4mm; line-height: 1.35; }
.kpi-visual { margin-top: 1.5mm; }

/* ── Tables ───────────────────────────────────────────────────────────── */
table.data { width: 100%; border-collapse: collapse; font-size: 8.4pt; }
table.data th { font-family: ${TYPE.display}; font-size: 6.9pt; font-weight: 700;
  letter-spacing: 0.13em; text-transform: uppercase; color: ${PAPER.inkMuted};
  padding: 0 3mm 1.8mm; border-bottom: 1px solid ${PAPER.axis}; white-space: nowrap; }
table.data td { padding: 1.7mm 3mm; border-bottom: 1px solid ${PAPER.grid}; vertical-align: top; }
table.data tr { break-inside: avoid; }
table.data tr:last-child td { border-bottom: none; }
/* Figures and dates never wrap: "8 Apr\n2022" doubles a row's height and
   costs a page across a 48-account file. */
table.data td.mono { font-size: 8.2pt; white-space: nowrap; }
table.data td.strong { font-weight: 600; }
.cell-sub { display: block; font-family: ${TYPE.display}; font-size: 6.9pt; color: ${PAPER.inkMuted}; margin-top: 0.4mm; }
.table-note { margin-top: 2.5mm; font-size: 7.8pt; color: ${PAPER.inkMuted}; }
.empty { padding: 6mm; text-align: center; font-family: ${TYPE.display}; font-size: 8pt;
  letter-spacing: 0.16em; text-transform: uppercase; color: ${PAPER.inkMuted}; }

/* ── Charts ───────────────────────────────────────────────────────────── */
.chart { width: 100%; }
.caption { margin: 2.5mm 0 0; font-size: 7.8pt; color: ${PAPER.inkSecondary}; line-height: 1.45; }

/* ── Callouts, ledger, facts ──────────────────────────────────────────── */
.callout { border-left: 2.5px solid; background: #fbfbf9; padding: 3mm 4mm; margin: 3mm 0;
  border-radius: 0 4px 4px 0; break-inside: avoid; }
.callout-title { font-family: ${TYPE.display}; font-size: 7.6pt; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 1.2mm; }
.callout p { margin: 0 0 2mm; font-size: 9pt; line-height: 1.5; }
.callout p:last-child { margin-bottom: 0; }

ul.ledger { list-style: none; margin: 0; padding: 0; }
ul.ledger li { display: grid; grid-template-columns: 10px 1fr auto; gap: 0 3mm;
  align-items: baseline; padding: 1.5mm 0; border-bottom: 1px solid ${PAPER.grid}; font-size: 8.6pt; }
ul.ledger li:last-child { border-bottom: none; }
.ledger-status { font-family: ${TYPE.mono}; font-size: 7.2pt; letter-spacing: 0.1em; text-transform: uppercase; }
.ledger-note { grid-column: 2 / -1; font-size: 7.8pt; color: ${PAPER.inkMuted}; }

.facts { display: grid; gap: 3mm; margin: 3mm 0; break-inside: avoid; }
.fact-label { font-family: ${TYPE.display}; font-size: 6.9pt; letter-spacing: 0.13em;
  text-transform: uppercase; color: ${PAPER.inkMuted}; margin-bottom: 0.8mm; }
.fact-value { font-size: 9.6pt; }

.pagebreak { break-after: page; }

/* ── Letterhead (v2) ─────────────────────────────────────────────────── */
.letterhead { display: flex; justify-content: space-between; align-items: flex-start; gap: 10mm;
  padding-bottom: 3.5mm; border-bottom: 2px solid ${PAPER.brand}; }
.lh-art { display: inline-block; }
.lh-art svg { height: 100%; width: auto; display: block; }
.lh-address { text-align: right; font-family: ${TYPE.display}; font-size: 7.2pt; line-height: 1.45; color: ${PAPER.inkSecondary}; }
.lh-address strong { color: ${PAPER.ink}; font-weight: 700; font-size: 7.8pt; }
.regnotice { margin: 3mm 0 0; border: 1px solid ${PAPER.axis}; background: #fff; padding: 2.2mm 3.5mm;
  font-family: ${TYPE.display}; font-size: 6.9pt; line-height: 1.5; color: ${PAPER.inkSecondary}; text-align: center; }
.doc-title { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; margin: 5mm 0 0; }
.doc-title h1 { font-size: 20pt; line-height: 1.1; margin: 1.5mm 0 1mm; font-weight: 700; letter-spacing: -0.015em; }
.doc-title .subtitle { color: ${PAPER.inkSecondary}; font-size: 9.2pt; max-width: 120mm; margin: 0; }
.eyebrow { font-family: ${TYPE.mono}; font-size: 7.2pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: ${PAPER.brand}; }
.subject-line { margin: 3mm 0 0; font-family: ${TYPE.display}; }
.subject-line .name { font-size: 12pt; font-weight: 700; color: ${PAPER.brand}; }
.subject-line .idline { font-family: ${TYPE.mono}; font-size: 8.4pt; font-weight: 700; color: ${PAPER.ink}; margin-top: 0.8mm; }
.subject-line .aliases { font-size: 7.6pt; color: ${PAPER.inkSecondary}; margin-top: 0.8mm; max-width: 175mm; }
.request { display: grid; grid-template-columns: 1.05fr 1.25fr 1fr 1.05fr 1.2fr; margin: 3.5mm 0 1mm;
  border: 1px solid ${PAPER.hairline}; background: #fff; break-inside: avoid; }
.request > div { padding: 2mm 2.8mm; border-right: 1px solid ${PAPER.hairline}; min-width: 0; }
.request > div:last-child { border-right: 0; }
.request .k { font-family: ${TYPE.display}; font-size: 6.2pt; letter-spacing: 0.12em; text-transform: uppercase; color: ${PAPER.inkMuted}; margin-bottom: 0.8mm; }
.request .v { font-family: ${TYPE.mono}; font-size: 7.4pt; color: ${PAPER.ink}; overflow-wrap: anywhere; line-height: 1.35; }
.source { margin: 0; padding: 1.6mm 4mm; border-top: 1px dashed ${PAPER.grid}; font-family: ${TYPE.mono};
  font-size: 6.6pt; color: ${PAPER.inkMuted}; letter-spacing: 0.02em; }
.tick { display: inline-block; vertical-align: -1px; margin-right: 1.2mm; }
.notices { margin-top: 8mm; }
.notices h2 { font-size: 11pt; margin: 0 0 2.5mm; }
.notice { border: 1px solid ${PAPER.hairline}; background: #fff; padding: 3mm 4mm; margin: 0 0 3mm; break-inside: avoid; }
.notice .t { font-family: ${TYPE.display}; font-size: 7pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${PAPER.inkSecondary}; margin-bottom: 1.4mm; }
.notice p { margin: 0 0 1mm; font-size: 7.8pt; line-height: 1.5; color: ${PAPER.ink}; }
.notice.ix { border-left: 2.5px solid ${PAPER.brand}; }
.verify { display: grid; grid-template-columns: 22mm 1fr; gap: 4mm; align-items: center; margin-top: 4mm; break-inside: avoid;
  border: 1px solid ${PAPER.hairline}; background: #fff; padding: 3mm 4mm; }
.verify .t { font-family: ${TYPE.display}; font-size: 7pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${PAPER.inkSecondary}; }
.verify p { margin: 1mm 0 0; font-size: 7.6pt; color: ${PAPER.inkSecondary}; }
.verify .mono { font-size: 7.2pt; color: ${PAPER.ink}; overflow-wrap: anywhere; }
.sample-mark { position: fixed; top: 46%; left: -20mm; right: -20mm; text-align: center; transform: rotate(-28deg);
  font-family: ${TYPE.display}; font-weight: 700; font-size: 54pt; letter-spacing: 0.12em; color: rgba(189, 56, 45, 0.07);
  pointer-events: none; z-index: 0; white-space: nowrap; }
.sample-strip { margin: 3mm 0 0; border: 1px solid ${STATE.bad}; color: ${STATE.bad}; background: #fff; padding: 1.8mm 3.5mm;
  font-family: ${TYPE.display}; font-size: 7pt; line-height: 1.45; }

/* ── Footer ───────────────────────────────────────────────────────────── */
.footer { margin-top: 8mm; padding-top: 3mm; border-top: 1px solid ${PAPER.hairline};
  display: flex; justify-content: space-between; gap: 8mm;
  font-family: ${TYPE.mono}; font-size: 6.9pt; color: ${PAPER.inkMuted}; letter-spacing: 0.04em; }
.footer .right { text-align: right; }
`;

let fontCache: string | null = null;

/** The embedded faces, read once per process. */
function fontCss(): string {
  if (fontCache === null) {
    try {
      fontCache = readFileSync(join(process.cwd(), "lib", "reports", "assets", "fonts.css"), "utf8");
    } catch {
      // A report without its faces is still a correct report — it just looks
      // wrong. Failing the render would be the worse outcome, so this degrades
      // loudly in the console and quietly on the page.
      console.warn("[reports] fonts.css not found — the document will render in fallback faces.");
      fontCache = "";
    }
  }
  return fontCache;
}

export type Tone = "good" | "watch" | "bad" | "info" | "mute";

export type Kpi = {
  label: string;
  value: string;
  /** A second line under the value: a comparison, a date, a qualifier. */
  note?: string;
  tone?: Tone;
  /** Inline SVG, e.g. a sparkline, rendered under the value. */
  visual?: string;
};

export type Column = {
  header: string;
  align?: "left" | "right" | "center";
  /** Percentage width. Omitted columns share what is left. */
  width?: number;
  mono?: boolean;
};

export type Cell = { text: string; tone?: Tone; mono?: boolean; strong?: boolean; sub?: string };

export type Block =
  | { kind: "kpis"; items: Kpi[] }
  | { kind: "chart"; title: string; hint?: string; svg: string; caption?: string; half?: boolean; source?: string }
  | { kind: "panel"; title?: string; hint?: string; html: string; half?: boolean; source?: string }
  | { kind: "table"; title?: string; hint?: string; columns: Column[]; rows: Cell[][]; note?: string; emptyMessage?: string; source?: string }
  | { kind: "callout"; tone: Tone; title: string; body: string }
  | { kind: "ledger"; items: { label: string; status: "present" | "unavailable" | "refused"; note?: string }[] }
  | { kind: "facts"; items: { label: string; value: string; mono?: boolean; verified?: boolean | null }[]; columns?: 2 | 3 | 4 }
  | { kind: "heading"; text: string; lede?: string }
  | { kind: "row"; blocks: Block[] }
  | { kind: "pagebreak" }
  | { kind: "html"; html: string };

export type ReportMeta = {
  /** "Ecosystem Exposure", "Metropol Credit File" … */
  title: string;
  /** The Interchange report type integer. */
  reportType: number;
  /** One line under the title. */
  subtitle?: string;
  /** Who asked. */
  member: { code: string; name: string };
  subjectToken: string;
  /** Rendered only when the borrower consented to identity disclosure. */
  subjectName?: string | null;
  consentRef?: string | null;
  generatedAt: string;
  /** Message-log receipt, when the call went through the exchange. */
  receipt?: { seq: string; hash: string } | null;
  /** "PRODUCTION" / "SANDBOX" — stamped when it is not the real thing. */
  environment?: string | null;
  /** Where the evidence came from: "Metropol CRB · report 12", "4 member nodes". */
  source?: string;

  // ── Letterhead v2 ────────────────────────────────────────────────────────
  /** "Bureau Direct" or "Interchange report": the line above the title. */
  eyebrow?: string;
  /** The person and the organisation, laid out the way the bureau prints them. */
  requestedBy?: { person?: string | null; organisation: string; memberCode: string } | null;
  /** IX-XXXX-XXXX-YYYYMMDD. Derived from the document when not given. */
  reference?: string | null;
  /** "2026-09-15 16:07:28 EAT". Falls back to generatedAt. */
  reportDate?: string | null;
  /** Present when the document carries bureau data: prints both bureau notices. */
  bureau?: { trxIds: string[]; reportTypes: number[] } | null;
  /** The person as the bureau identified them, for bureau documents. */
  subjectIdentity?: {
    name: string | null;
    idTypeLabel: string;
    idNumber: string;
    verified: boolean | null;
    reportedNames?: string[];
  } | null;
  /** SHA-256 of the document's structured content, printed beside the QR code. */
  contentDigest?: string | null;
  /** An anonymised sample: watermarked on every page. */
  sample?: boolean;
  /** Present when the document was read from an M-PESA statement. */
  statement?: { fileSha256: string | null; period: string; holder: string | null; synthetic?: boolean } | null;
};

export type ReportDocument = { meta: ReportMeta; blocks: Block[] };

const TONE_COLOR: Record<Tone, string> = {
  good: STATE.good,
  watch: STATE.watch,
  bad: STATE.bad,
  info: PAPER.brand,
  mute: PAPER.inkMuted,
};

/** The two-routes-crossing mark, drawn at whatever size the caller needs. */
export function mark(size = 22, color = PAPER.brand): string {
  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" aria-hidden="true" style="display:block">` +
    `<path d="M3 8 C 9 8, 15 16, 21 16" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>` +
    `<path d="M3 16 C 9 16, 15 8, 21 8" stroke="${color}" stroke-opacity="0.45" stroke-width="1.7" stroke-linecap="round"/></svg>`
  );
}

function renderKpis(items: Kpi[]): string {
  const cells = items
    .map(
      (k) => `<div class="kpi">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value" style="color:${k.tone ? TONE_COLOR[k.tone] : PAPER.ink}">${esc(k.value)}</div>
        ${k.visual ? `<div class="kpi-visual">${k.visual}</div>` : ""}
        ${k.note ? `<div class="kpi-note">${esc(k.note)}</div>` : ""}
      </div>`,
    )
    .join("");
  return `<div class="kpis" style="grid-template-columns:repeat(${Math.min(items.length, 5)},1fr)">${cells}</div>`;
}

function renderTable(b: Extract<Block, { kind: "table" }>): string {
  if (b.rows.length === 0) {
    return panelWrap(
      b.title,
      b.hint,
      `<div class="empty">${esc(b.emptyMessage ?? "Nothing reported")}</div>`,
      false,
      b.source,
    );
  }
  const head = b.columns
    .map((c) => `<th style="text-align:${c.align ?? "left"}${c.width ? `;width:${c.width}%` : ""}">${esc(c.header)}</th>`)
    .join("");
  const body = b.rows
    .map((row) => {
      const tds = row
        .map((cell, i) => {
          const col = b.columns[i];
          const cls = [col?.mono || cell.mono ? "mono" : "", cell.strong ? "strong" : ""].filter(Boolean).join(" ");
          const color = cell.tone ? ` style="color:${TONE_COLOR[cell.tone]}"` : "";
          const sub = cell.sub ? `<span class="cell-sub">${esc(cell.sub)}</span>` : "";
          return `<td class="${cls}" align="${col?.align ?? "left"}"${color}>${esc(cell.text)}${sub}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
  const note = b.note ? `<div class="table-note">${esc(b.note)}</div>` : "";
  return panelWrap(b.title, b.hint, `<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${note}`, false, b.source, b.rows.length > 14);
}

function panelWrap(title: string | undefined, hint: string | undefined, inner: string, half: boolean, source?: string, flow = false): string {
  const header = title
    ? `<header class="panel-head"><h3>${esc(title)}</h3>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</header>`
    : "";
  // Provenance on the block itself: whose statement this figure is.
  const src = source ? `<p class="source">${esc(source)}</p>` : "";
  return `<section class="panel${half ? " half" : ""}${flow ? " flow" : ""}">${header}<div class="panel-body">${inner}</div>${src}</section>`;
}

/** A drawn tick. A glyph would pull in a fallback face — see the ledger note below. */
function tick(color: string = STATE.good): string {
  return (
    `<svg class="tick" width="9" height="9" viewBox="0 0 10 10" aria-label="verified">` +
    `<circle cx="5" cy="5" r="5" fill="${color}"/><path d="M2.6 5.2 L4.3 6.8 L7.5 3.4" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}

function renderBlock(b: Block): string {
  switch (b.kind) {
    case "kpis":
      return renderKpis(b.items);
    case "chart":
      return panelWrap(
        b.title,
        b.hint,
        `<div class="chart">${b.svg}</div>${b.caption ? `<p class="caption">${esc(b.caption)}</p>` : ""}`,
        !!b.half,
        b.source,
      );
    case "panel":
      return panelWrap(b.title, b.hint, b.html, !!b.half, b.source);
    case "table":
      return renderTable(b);
    case "callout":
      // A blank line in the body becomes a paragraph. Callouts carry reasoning
      // as often as they carry a warning, and reasoning needs more than one
      // paragraph without needing a whole panel.
      return `<aside class="callout" style="border-left-color:${TONE_COLOR[b.tone]}">
        <div class="callout-title" style="color:${TONE_COLOR[b.tone]}">${esc(b.title)}</div>
        ${b.body
          .split(/\n{2,}/)
          .map((p) => `<p>${esc(p.trim())}</p>`)
          .join("")}</aside>`;
    case "ledger": {
      // The blueprint's rule made visible: a missing block and a clean block
      // mean opposite things, so absence is printed rather than omitted.
      //
      // The status marks are DRAWN, not typed. ● ○ ✕ are geometric-shape
      // codepoints that no text face carries, so a character here silently
      // pulls in Segoe UI Symbol or Times for that one glyph — which is both
      // ugly and the exact signature of a font that failed to load.
      const rows = b.items
        .map((i) => {
          const tone = i.status === "present" ? "good" : i.status === "refused" ? "bad" : "mute";
          const c = TONE_COLOR[tone as Tone];
          const glyph =
            i.status === "present"
              ? `<svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="${c}"/></svg>`
              : i.status === "refused"
                ? `<svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2 L8 8 M8 2 L2 8" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/></svg>`
                : `<svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" fill="none" stroke="${c}" stroke-width="1.4"/></svg>`;
          return `<li><span class="dot">${glyph}</span>
            <span class="ledger-label">${esc(i.label)}</span>
            <span class="ledger-status" style="color:${TONE_COLOR[tone as Tone]}">${esc(i.status)}</span>
            ${i.note ? `<span class="ledger-note">${esc(i.note)}</span>` : ""}</li>`;
        })
        .join("");
      return panelWrap("Evidence blocks", "what this file is assembled from", `<ul class="ledger">${rows}</ul>`, false);
    }
    case "facts": {
      const items = b.items
        .map(
          (f) => `<div class="fact"><div class="fact-label">${esc(f.label)}</div>
            <div class="fact-value${f.mono ? " mono" : ""}">${f.verified ? tick() : ""}${esc(f.value)}</div></div>`,
        )
        .join("");
      return `<div class="facts" style="grid-template-columns:repeat(${b.columns ?? 3},1fr)">${items}</div>`;
    }
    case "heading":
      return `<div class="section-heading"><h2>${esc(b.text)}</h2>${b.lede ? `<p>${esc(b.lede)}</p>` : ""}</div>`;
    case "row":
      return `<div class="row">${b.blocks.map(renderBlock).join("")}</div>`;
    case "pagebreak":
      return `<div class="pagebreak"></div>`;
    case "html":
      return b.html;
  }
}

/**
 * The document stylesheet, shared by every Interchange artefact.
 *
 * Exported rather than inlined so a briefing, a runbook or a member pack is the
 * SAME document — same type, same rules, same page furniture — with a different
 * masthead. Two stylesheets would drift within a week.
 */
export function documentCss(): string {
  return `${fontCss()}${LAYOUT_CSS}`;
}

/** Render a block list. The shared body of every document type. */
export function renderBlocks(blocks: Block[]): string {
  return blocks.map(renderBlock).join("\n");
}

/**
 * Resolve the letterhead facts a document prints, filling what the caller did
 * not supply from what it did. Exported so the JSON envelope can carry the SAME
 * reference and date the PDF prints.
 */
export function resolveMeta(m: ReportMeta): ReportMeta & { reference: string; reportDate: string } {
  const reference =
    m.reference ??
    documentReference(
      [m.member.code, m.subjectToken, m.generatedAt, m.reportType, m.receipt?.hash ?? "", m.contentDigest ?? ""].join("|"),
    );
  return { ...m, reference, reportDate: m.reportDate ?? m.generatedAt };
}

/**
 * The corner block. `memberCode` is the member who REQUESTED the document, and
 * it selects whose registered details print — see letterheadFor() in ../brand
 * for why that is the requesting lender rather than the network operator.
 */
function letterheadHtml(memberCode?: string | null): string {
  const art = brandArtwork();
  const lh = letterheadFor(memberCode);
  // The drawn mark stands in only if the artwork cannot be read from disk —
  // a rendering fault, not the normal path.
  const left = art.lockup ?? `<div class="brandline">${mark(24)}<span class="name">${esc(lh.name)}</span></div>`;
  // Registration numbers sit on one line so the block stays four or five lines
  // deep whatever the company holds. A letterhead that grows a line per
  // identifier pushes the document's first heading below the fold.
  const registrations = [
    lh.companyRegistration ? `Reg. ${esc(lh.companyRegistration)}` : "",
    lh.kraPin ? `KRA PIN ${esc(lh.kraPin)}` : "",
    lh.odpcRegistration ? `ODPC ${esc(lh.odpcRegistration)}` : "",
  ].filter(Boolean).join(" · ");
  const lines = [
    `<strong>${esc(lh.legalName ?? lh.name)}</strong>`,
    ...lh.addressLines.map(esc),
    [lh.phone ? esc(lh.phone) : "", lh.email ? esc(lh.email) : ""].filter(Boolean).join(" · "),
    esc(lh.website),
    registrations,
  ].filter(Boolean);
  return `<header class="letterhead"><div>${left}</div><div class="lh-address">${lines.join("<br>")}</div></header>`;
}

/** Page furniture printed in the margins of EVERY page: reference and page count. */
function marginCss(reference: string, sample: boolean): string {
  // Web fonts do not reach Chromium's page-margin boxes (they print in Times),
  // so the margins use a system monospace that the Windows engine host has.
  const q = (t: string) => t.replace(/\\/g, "").replace(/"/g, "'");
  const face = "font-family: Consolas, 'Courier New', monospace; font-size: 6.6pt; color: #898781;";
  return `@page {
  @bottom-left { content: "${q(reference)} · Confidential"; ${face} }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); ${face} }
  ${sample ? `@top-right { content: "SAMPLE · ANONYMISED"; ${face} color: #bd382d; }` : ""}
}`;
}

export function renderReportHtml(doc: ReportDocument): string {
  const m = resolveMeta(doc.meta);
  const sampleNotice = m.statement?.synthetic ? SYNTHETIC_SAMPLE_NOTICE : SAMPLE_NOTICE;
  const bureau = !!m.bureau;
  const requested = m.requestedBy ?? { person: null, organisation: m.member.name, memberCode: m.member.code };

  const subject = m.subjectIdentity
    ? `<div class="subject-line">
        ${m.subjectIdentity.name ? `<div class="name">${m.subjectIdentity.verified ? tick() : ""}${esc(m.subjectIdentity.name)}</div>` : ""}
        <div class="idline">${esc(m.subjectIdentity.idTypeLabel.toUpperCase())} : ${esc(m.subjectIdentity.idNumber)}</div>
        ${m.subjectIdentity.reportedNames?.length ? `<div class="aliases">Reported names: ${m.subjectIdentity.reportedNames.map(esc).join(", ")}</div>` : ""}
      </div>`
    : `<div class="subject-line"><div class="idline">SUBJECT TOKEN : ${esc(m.subjectToken.slice(0, 24))}…</div></div>`;

  const trx = m.bureau?.trxIds ?? [];
  const request = `<div class="request">
    <div><div class="k">Requested by</div><div class="v">${esc(requested.person ?? "API call")}</div></div>
    <div><div class="k">Requesting organisation</div><div class="v">${esc(requested.organisation)}<br>${esc(requested.memberCode)}</div></div>
    <div><div class="k">Report date</div><div class="v">${esc(m.reportDate)}</div></div>
    <div><div class="k">Reference number</div><div class="v">#REF ${esc(m.reference)}</div></div>
    <div><div class="k">${bureau ? "Bureau transaction" : "Consent"}</div><div class="v">${
      bureau
        ? trx.length
          ? `${esc(trx[0].slice(0, 18))}…${trx.length > 1 ? ` +${trx.length - 1}` : ""}`
          : "not returned"
        : esc(m.consentRef ?? "not presented")
    }</div></div>
  </div>`;

  const url = verifyUrl(m.reference);
  const verify = `<section class="verify">
    <div>${qrSvg(url, 20)}</div>
    <div>
      <div class="t">Verify this document</div>
      <p>Scan the code, or open <span class="mono">${esc(url)}</span>. The page shows whether this reference exists and the fingerprint its content must match.</p>
      ${m.contentDigest ? `<p>Content fingerprint <span class="mono">sha256:${esc(m.contentDigest)}</span></p>` : ""}
      ${m.receipt ? `<p>Message log entry <span class="mono">#${esc(m.receipt.seq)} · ${esc(m.receipt.hash.slice(0, 32))}…</span></p>` : ""}
    </div>
  </section>`;

  const notices = `<section class="notices">
    <h2>Notices</h2>
    ${
      bureau
        ? `<div class="notice"><div class="t">Disclaimer</div>${BUREAU_DISCLAIMER_LINES.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
           <div class="notice ix"><div class="t">About this document</div><p>${esc(INTERCHANGE_BUREAU_NOTICE)}</p></div>`
        : m.statement
          ? `<div class="notice ix"><div class="t">About this document</div><p>${esc(INTERCHANGE_STATEMENT_NOTICE)}</p>${
              m.statement.fileSha256 ? `<p>Statement fingerprint sha256:${esc(m.statement.fileSha256)}</p>` : ""
            }</div>`
          : `<div class="notice ix"><div class="t">About this document</div><p>${esc(INTERCHANGE_ECOSYSTEM_NOTICE)}</p></div>`
    }
    ${m.sample ? `<div class="notice" style="border-left:2.5px solid ${STATE.bad}"><div class="t" style="color:${STATE.bad}">Sample</div><p>${esc(sampleNotice)}</p></div>` : ""}
    ${verify}
  </section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(m.title)} · ${esc(m.reference)} · The Interchange</title>
<style>
${documentCss()}
${marginCss(m.reference, !!m.sample)}
</style>
</head>
<body>
${m.sample ? `<div class="sample-mark" aria-hidden="true">SAMPLE · ANONYMISED</div>` : ""}
${letterheadHtml(m.member.code)}
${bureau ? `<div class="regnotice">${esc(REGULATION_40_NOTICE)}</div>` : ""}
${m.sample ? `<div class="sample-strip">${esc(sampleNotice)}</div>` : ""}

<div class="doc-title">
  <div>
    <div class="eyebrow">${esc(m.eyebrow ?? (bureau ? "Bureau Direct" : m.statement ? "Statement Crunch" : "Interchange report"))} · Report ${esc(String(m.reportType))}</div>
    <h1>${esc(m.title)}</h1>
    ${m.subtitle ? `<p class="subtitle">${esc(m.subtitle)}</p>` : ""}
  </div>
  <div style="display:flex;gap:2mm;align-items:center">
    ${m.environment ? `<span class="stamp">${esc(m.environment)}</span>` : ""}
  </div>
</div>
${subject}
${request}
${m.source ? `<p class="source" style="border:0;padding:0.5mm 0 0">Source: ${esc(m.source)}</p>` : ""}

<main>
${doc.blocks.map(renderBlock).join("\n")}
</main>

${notices}
</body>
</html>`;
}
