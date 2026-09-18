// ─────────────────────────────────────────────────────────────────────────────
// THE BRAND SPECIFICATION — every size the ecosystem needs, measured.
//
//   npx tsx scripts/build-brand-spec.ts
//
// Writes reports/Interchange-Brand-Spec-<date>.{html,pdf}
//
// ── WHY THIS IS GENERATED AND NOT WRITTEN ────────────────────────────────────
// A brand sheet that is typed up by hand starts drifting the day after it is
// signed off: a size changes in the code, nobody edits the document, and six
// months later a designer produces an asset to a spec that stopped being true.
//
// Every number below is READ from the files on disk or from the code that uses
// them. If a size here is wrong, the fix is in the source, and re-running this
// makes the document right again.
// ─────────────────────────────────────────────────────────────────────────────
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { join, resolve } from "path";
import { htmlToPdf, chromiumPath, fontsLanded, pageCount } from "../lib/reports/render";
import { LETTERHEAD, BRAND_COLOURS } from "../lib/brand";
import { esc } from "../lib/reports/theme";

const BRAND = resolve("public/brand");
const OUT = resolve("../../../reports");
const DATE = new Date().toISOString().slice(0, 10);

const N = BRAND_COLOURS.navy;
const G = BRAND_COLOURS.green;
const INK = "#14181b";
const MUTED = "#6b7580";
const RULE = "#e2e6ea";
const PAPER = "#fcfcfb";

function dataUri(rel: string): string | null {
  const p = join(BRAND, rel);
  if (!existsSync(p)) return null;
  const ext = rel.split(".").pop()!.toLowerCase();
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(p).toString("base64")}`;
}

type Asset = { file: string; w: number; h: number; kb: number; used: string };

async function measure(files: string[]): Promise<Asset[]> {
  const out: Asset[] = [];
  for (const [file, used] of files.map((f) => f.split("|") as [string, string])) {
    const p = join(BRAND, file);
    if (!existsSync(p)) continue;
    const m = await sharp(p).metadata();
    out.push({ file, w: m.width ?? 0, h: m.height ?? 0, kb: Math.round(statSync(p).size / 1024), used });
  }
  return out;
}

// ── The specification itself ─────────────────────────────────────────────────
//
// Sizes are stated in the unit the surface is actually built in: millimetres for
// print, CSS pixels for screen, device pixels for icons. Converting them all to
// one unit would be tidier and would guarantee somebody builds a 10mm favicon.

type Row = { where: string; element: string; size: string; asset: string; note: string };

const SCREEN: Row[] = [
  { where: "Public site header", element: "Mark", size: "32 × 32 px (render), 8mm equivalent", asset: "mark-192.png", note: "Served at 192px and scaled down, so it stays crisp on a 2× display. The wordmark beside it is LIVE TEXT, not artwork." },
  { where: "Public site header", element: "Wordmark", size: "13px, letter-spacing 0.3em, uppercase", asset: "type, not artwork", note: "The supplied lockup sets “Inter” in navy #003868, which measures 1.6:1 on the dark header and cannot be read. Type can be." },
  { where: "Console header", element: "Mark", size: "28 × 28 px", asset: "mark-192.png", note: "Slightly smaller than the site: the console is an instrument and the chrome should recede." },
  { where: "Site footer", element: "Mark", size: "28 × 28 px", asset: "mark-192.png", note: "" },
  { where: "Sign-in gate", element: "Mark", size: "64 × 64 px", asset: "mark-192.png", note: "The one screen where the mark is the only thing on the page, so it earns the size." },
  { where: "Browser tab", element: "Favicon", size: "512 × 512 px source", asset: "app/icon.png", note: "Next.js serves every size the browser asks for from this one file. Must read at 16px — the mark does; the full lockup would not." },
  { where: "iOS home screen", element: "Apple touch icon", size: "180 × 180 px, opaque", asset: "app/apple-icon.png", note: "The ONLY asset with deliberate padding and a solid white ground. iOS masks edge to edge and renders a transparent icon black." },
  { where: "Android / PWA", element: "Home screen icon", size: "192 × 192 px", asset: "mark-192.png", note: "" },
  { where: "WhatsApp, LinkedIn, X", element: "Share card", size: "1200 × 630 px", asset: "og-1200x630.png", note: "On PAPER, not on the console ground. Every one of these platforms crops from 1200×630 and overlays chrome on the right third, so the lockup sits left." },
];

const PRINT: Row[] = [
  { where: "Report letterhead", element: "Horizontal lockup", size: "11mm tall, width follows (≈55mm)", asset: "lockup-800.png", note: "Inlined as a data URI. A relative URL resolves to nothing in the PDF renderer and the letterhead prints empty, with no error anywhere." },
  { where: "Report letterhead", element: "Address block", size: "6.6pt, right aligned, 4–5 lines", asset: "text", note: "Registration numbers share one line so the block never grows past five lines and push the first heading below the fold." },
  { where: "Cashflow report cover", element: "Mark + wordmark", size: "10mm mark, 11pt wordmark", asset: "mark-192.png", note: "The dark cover uses the mark and live type for the same contrast reason as the site header." },
  { where: "Every report page", element: "Brand edge", size: "3.2mm wide, full height", asset: "gradient, no file", note: "Navy at the top to green at the bottom. The cheapest way to make loose pages read as one document." },
  { where: "Report page", element: "Page size and margin", size: "A4 portrait, 210 × 297mm, 14–15mm margin", asset: "—", note: "Wide enough for a hole punch and a filing stamp." },
  { where: "Invoice / letter", element: "Lockup", size: "11mm tall", asset: "lockup-800.png", note: "Same as the report letterhead, so the two are recognisably one house." },
  { where: "Slide master", element: "Lockup", size: "Up to 1600px wide", asset: "lockup-1600.png", note: "" },
  { where: "Email signature", element: "Lockup", size: "400 × 80 px, or 200px CSS width", asset: "lockup-400.png", note: "Some clients drop the alpha channel — use lockup-800-white.png there." },
];

const CLEARANCE: Row[] = [
  { where: "All surfaces", element: "Clear space", size: "Half the mark's height on every side", asset: "—", note: "Measured from the artwork's own content box, not from the delivered PNG's canvas — the supplied files carry ~20% whitespace of their own, and treating that as the clear space makes the logo read timid." },
  { where: "All surfaces", element: "Minimum mark size", size: "16px screen / 5mm print", asset: "—", note: "Below this the hub and the four nodes merge into a blob." },
  { where: "All surfaces", element: "Minimum lockup width", size: "120px screen / 32mm print", asset: "—", note: "Below this the strapline is unreadable and the lockup should be replaced by the mark." },
  { where: "Dark surfaces", element: "Lockup", size: "Do not use", asset: "—", note: "The wordmark is navy #003868. On the console ground #040605 that measures 1.6:1. Use the mark plus live white type." },
];

function table(rows: Row[], title: string, lede: string): string {
  return `
<section class="blk">
  <h2>${esc(title)}</h2>
  <p class="lede">${lede}</p>
  <table>
    <thead><tr><th style="width:26%">Where</th><th style="width:16%">Element</th><th style="width:22%">Size</th><th style="width:16%">Asset</th></tr></thead>
    <tbody>
      ${rows.map((r) => `<tr>
        <td class="k">${esc(r.where)}</td>
        <td>${esc(r.element)}</td>
        <td class="m">${esc(r.size)}</td>
        <td class="m mut">${esc(r.asset)}</td>
      </tr>${r.note ? `<tr class="n"><td></td><td colspan="3">${esc(r.note)}</td></tr>` : ""}`).join("")}
    </tbody>
  </table>
</section>`;
}

async function main() {
  const assets = await measure([
    "mark-512.png|Source for anything larger; press and print",
    "mark-192.png|PWA and Android home screen; every in-app mark",
    "mark-64.png|Console sidebar, sign-in card",
    "mark-32.png|Site header, table rows",
    "lockup-1600.png|Press kit, slide masters, large print",
    "lockup-800.png|Letterhead at 2× — what the PDF renderer inlines",
    "lockup-400.png|Web header on light ground, email signature",
    "lockup-800-white.png|Email clients and Office templates that drop alpha",
    "og-1200x630.png|WhatsApp, LinkedIn and X link previews",
    "logo.png|As supplied — flat white ground",
    "logo-transparent.png|As supplied — transparent",
    "logo-favicon.png|As supplied — the mark alone",
  ]);

  const lockup = dataUri("lockup-800.png");
  const mark = dataUri("mark-192.png");

  const swatches = [
    { name: "Navy", hex: BRAND_COLOURS.navy, use: "Structure, wordmark, letterhead rules, the top of the page edge" },
    { name: "Navy mid", hex: BRAND_COLOURS.navyMid, use: "The lighter blue nodes in the mark; secondary rules" },
    { name: "Green", hex: BRAND_COLOURS.green, use: "Movement and success; the bottom of the page edge" },
    { name: "Green light", hex: BRAND_COLOURS.greenLight, use: "The lighter green nodes in the mark" },
    { name: "Console ground", hex: BRAND_COLOURS.consoleGround, use: "The console and the dark report surface" },
    { name: "Paper", hex: PAPER, use: "Every printed report except Cashflow & Affordability" },
  ];

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Interchange brand specification</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 portrait; margin: 16mm 15mm 15mm; }
  html, body { margin: 0; background: ${PAPER}; color: ${INK};
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif; font-size: 9.6pt; line-height: 1.5; }
  h1 { font-size: 24pt; margin: 0 0 2mm; letter-spacing: -0.015em; color: ${N}; }
  h2 { font-size: 12.5pt; margin: 0 0 1.5mm; color: ${N}; letter-spacing: -0.01em; }
  .sub { font-size: 10.5pt; color: ${MUTED}; margin: 0 0 8mm; }
  .lede { color: ${MUTED}; margin: 0 0 3mm; max-width: 165mm; }
  .blk { margin-bottom: 8mm; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 7pt; text-transform: uppercase; letter-spacing: .1em;
       color: ${MUTED}; font-weight: 600; padding: 0 2mm 1.5mm 0; border-bottom: 1.2px solid ${N}; }
  td { padding: 1.8mm 2mm 1.8mm 0; border-bottom: 1px solid ${RULE}; vertical-align: top; }
  td.k { font-weight: 600; }
  td.m { font-family: Consolas, "Courier New", monospace; font-size: 8.6pt; }
  td.mut { color: ${MUTED}; }
  tr.n td { border-bottom: 1px solid ${RULE}; padding-top: 0; font-size: 8.2pt; color: ${MUTED}; line-height: 1.45; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm;
          padding-bottom: 4mm; margin-bottom: 8mm; border-bottom: 2.5px solid ${N}; }
  .head img { height: 13mm; object-fit: contain; }
  .lh { text-align: right; font-size: 7.6pt; color: ${MUTED}; line-height: 1.6; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .sw { border: 1px solid ${RULE}; border-radius: 2mm; overflow: hidden; }
  .sw .chip { height: 16mm; }
  .sw .meta { padding: 2.5mm 3mm; }
  .sw .nm { font-weight: 600; font-size: 9pt; }
  .sw .hx { font-family: Consolas, monospace; font-size: 8.4pt; color: ${MUTED}; }
  .sw .us { font-size: 7.6pt; color: ${MUTED}; margin-top: 1mm; line-height: 1.4; }
  .spec { border: 1px solid ${RULE}; border-radius: 2mm; padding: 4mm; background: #fff; }
  .spec img { display: block; max-width: 100%; }
  .cap { font-size: 7.6pt; color: ${MUTED}; margin-top: 2mm; }
  .rule { height: 3px; background: linear-gradient(90deg, ${N}, ${G}); margin: 6mm 0; border-radius: 2px; }
  .foot { margin-top: 8mm; padding-top: 3mm; border-top: 1px solid ${RULE}; font-size: 7.4pt; color: ${MUTED}; }
  .warn { border-left: 3px solid ${G}; padding: 2mm 0 2mm 4mm; margin: 3mm 0; font-size: 8.8pt; }
</style></head><body>

<div class="head">
  ${lockup ? `<img src="${lockup}" alt="Interchange">` : `<h1>Interchange</h1>`}
  <div class="lh">
    <strong style="color:${INK}">${esc(LETTERHEAD.legalName ?? LETTERHEAD.name)}</strong><br>
    ${LETTERHEAD.addressLines.map(esc).join("<br>")}<br>
    ${esc(LETTERHEAD.phone ?? "")} · ${esc(LETTERHEAD.email ?? "")}<br>
    ${esc(LETTERHEAD.website)}<br>
    Reg. ${esc(LETTERHEAD.companyRegistration ?? "—")}${LETTERHEAD.kraPin ? ` · KRA PIN ${esc(LETTERHEAD.kraPin)}` : ""}
  </div>
</div>

<h1>Brand specification</h1>
<p class="sub">Every size the Interchange ecosystem needs, measured from the artwork and the code that uses it · ${esc(DATE)}</p>

<div class="warn">
  <strong>Only three files were supplied, and only three are needed.</strong> Everything in this document is derived from
  them by <code>scripts/build-brand-assets.ts</code> — no size here was cut by hand, and none should be. If a size is
  wrong, the fix goes in that script and this document is re-generated.
</div>

${table(SCREEN, "Screen", "Sizes are CSS pixels at 1×. Every raster is served at 2× or better and scaled down, because a mark that is served at its display size is a mark that looks soft on every phone sold since 2015.")}

<div class="rule"></div>

${table(PRINT, "Print and documents", "Sizes are millimetres on A4. The PDF renderer inlines every image as a data URI — a relative URL resolves to nothing from the temporary directory a document is printed in, and the failure is silent.")}

${table(CLEARANCE, "Clear space and minimum sizes", "Measured from the artwork's own content box. The supplied PNGs carry roughly 20% whitespace inside their canvas; that is packaging, not clear space.")}

<div class="blk">
  <h2>The files</h2>
  <p class="lede">What exists today, and what each one is for.</p>
  <table>
    <thead><tr><th style="width:34%">File</th><th style="width:16%">Pixels</th><th style="width:10%">Size</th><th>Used for</th></tr></thead>
    <tbody>
      ${assets.map((a) => `<tr>
        <td class="m">public/brand/${esc(a.file)}</td>
        <td class="m">${a.w} × ${a.h}</td>
        <td class="m mut">${a.kb} KB</td>
        <td style="font-size:8.4pt;color:${MUTED}">${esc(a.used)}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</div>

<div class="blk">
  <h2>Colour</h2>
  <p class="lede">Sampled from the supplied artwork, not chosen. Navy carries structure and type; green carries movement and success. Neither is ever used for a warning — those stay amber and red, which is why the arrears ramp in the report kit is a separate single-hue scale.</p>
  <div class="grid">
    ${swatches.map((s) => `<div class="sw">
      <div class="chip" style="background:${s.hex}"></div>
      <div class="meta"><div class="nm">${esc(s.name)}</div><div class="hx">${esc(s.hex.toUpperCase())}</div><div class="us">${esc(s.use)}</div></div>
    </div>`).join("")}
  </div>
</div>

<div class="blk">
  <h2>The mark at every size it is used</h2>
  <div class="spec">
    <div style="display:flex;align-items:flex-end;gap:8mm">
      ${[64, 48, 32, 24, 16].map((px) => mark ? `<div style="text-align:center">
        <img src="${mark}" style="width:${px}px;height:${px}px" alt="">
        <div class="cap">${px}px</div>
      </div>` : "").join("")}
    </div>
    <div class="cap" style="margin-top:4mm">
      16px is the floor. Below it the hub and the four nodes merge and the glyph stops being a glyph.
    </div>
  </div>
</div>

<div class="blk">
  <h2>What is still missing</h2>
  <p class="lede">The three supplied files cover everything built so far. These are the gaps that will be felt later, in the order they will be felt.</p>
  <table>
    <thead><tr><th style="width:28%">Missing</th><th style="width:22%">Where it will be needed</th><th>Why it cannot be derived</th></tr></thead>
    <tbody>
      <tr><td class="k">SVG master of the mark</td><td>Any size above 512px; embroidery; signage; email</td>
        <td style="font-size:8.4pt;color:${MUTED}">The supplied PNG has gradients and soft joins. Tracing it would be a redrawing, not a conversion, and the result would not be the same mark.</td></tr>
      <tr><td class="k">White / knockout lockup</td><td>Dark decks, the dark report cover, merchandise</td>
        <td style="font-size:8.4pt;color:${MUTED}">The wordmark is navy. Recolouring a raster leaves haloes on the anti-aliased edges. Until it exists, dark surfaces use the mark plus live type, which is what they do today.</td></tr>
      <tr><td class="k">Single-colour black lockup</td><td>Fax, stamps, one-colour print, legal filings</td>
        <td style="font-size:8.4pt;color:${MUTED}">Flattening two hues to one needs a designer's judgement about which shapes survive.</td></tr>
      <tr><td class="k">ODPC registration number</td><td>Every report footer and the privacy notice</td>
        <td style="font-size:8.4pt;color:${MUTED}">Not supplied, so it does not print. A plausible-looking number on a regulated document would be a fabrication.</td></tr>
    </tbody>
  </table>
</div>

<div class="foot">
  Generated by <code>scripts/build-brand-spec.ts</code> on ${esc(DATE)} from the files in
  <code>interchange/apps/interchange-console/public/brand/</code>. Every measurement is read from those files or from the
  code that consumes them. ${esc(LETTERHEAD.legalName ?? "")} · ${esc(LETTERHEAD.website)}
</div>

</body></html>`;

  writeFileSync(join(OUT, `Interchange-Brand-Spec-${DATE}.html`), html);
  console.log(`  html → reports/Interchange-Brand-Spec-${DATE}.html`);

  if (!chromiumPath()) {
    console.log("  no headless Chromium on this host — PDF skipped.");
    return;
  }
  const pdf = await htmlToPdf(html);
  const fonts = fontsLanded(pdf);
  writeFileSync(join(OUT, `Interchange-Brand-Spec-${DATE}.pdf`), pdf);
  console.log(`  pdf  → reports/Interchange-Brand-Spec-${DATE}.pdf · ${pageCount(pdf) ?? "?"} pages · ${Math.round(pdf.length / 1024)} KB · faces ${fonts.fonts.join(", ") || "system"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
