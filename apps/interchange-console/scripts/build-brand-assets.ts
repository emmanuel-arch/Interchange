// ─────────────────────────────────────────────────────────────────────────────
// BRAND ASSETS — derive every size the ecosystem needs from the three files the
// founder supplied, so nobody ever resizes a logo by hand again.
//
//   npx tsx scripts/build-brand-assets.ts
//
// ── WHY DERIVE RATHER THAN HAND-CUT ──────────────────────────────────────────
// The supplied artwork carries generous whitespace: the mark occupies 351 px of
// a 440 px canvas, and the lockup 1736 px of 1983. Dropped into a 36 px header
// slot that padding eats a fifth of the glyph and the logo reads small and
// timid beside type that was set to the full box. So every output here is cut
// to the artwork's own content box first, and padding is then added back
// deliberately where a platform requires it — which is exactly once, for the
// Apple touch icon, whose canvas is drawn edge to edge by iOS.
//
// Everything written by this script is REGENERABLE. Nothing here is edited by
// hand; if a size is wrong, the fix goes in this file.
// ─────────────────────────────────────────────────────────────────────────────
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const BRAND = resolve("public/brand");
const APP = resolve("app");

/** Sampled from the supplied artwork, not picked by eye. See BRAND_COLOURS. */
const NAVY = "#003868";
const GREEN = "#409828";

type Written = { file: string; size: string; bytes: number; used: string };
const written: Written[] = [];

function note(file: string, size: string, bytes: number, used: string) {
  written.push({ file, size, bytes, used });
}

/**
 * The artwork's own bounding box, ignoring transparent AND white pixels.
 *
 * `sharp.trim()` only removes pixels matching the top-left corner, which on the
 * "transparent" file is transparent and on the flat file is white — so one call
 * cannot handle both. This measures instead, and treats near-white as padding
 * whatever the alpha channel claims.
 */
async function contentBox(path: string) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const a = data[i + 3];
      if (a < 40) continue;
      if (data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Whether the file's corners are actually transparent, or only white. */
async function isReallyTransparent(path: string): Promise<boolean> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const corner = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
  return corner(0, 0) < 40 && corner(info.width - 1, 0) < 40;
}

async function main() {
  mkdirSync(BRAND, { recursive: true });

  const markSrc = join(BRAND, "logo-favicon.png");
  const lockSrc = join(BRAND, "logo-transparent.png");
  const lockFlat = join(BRAND, "logo.png");

  const markBox = await contentBox(markSrc);
  const lockBox = await contentBox(lockSrc);
  const lockTransparent = await isReallyTransparent(lockSrc);

  console.log(`  mark   content ${markBox.width}×${markBox.height} at ${markBox.left},${markBox.top}`);
  console.log(`  lockup content ${lockBox.width}×${lockBox.height} at ${lockBox.left},${lockBox.top}  transparent=${lockTransparent}`);

  // The mark, cut square around its own content and centred, so a round CSS
  // frame in the console does not clip one arm of the X.
  const markSide = Math.max(markBox.width, markBox.height);
  const squareMark = sharp(markSrc)
    .extract(markBox)
    .extend({
      top: Math.round((markSide - markBox.height) / 2),
      bottom: markSide - markBox.height - Math.round((markSide - markBox.height) / 2),
      left: Math.round((markSide - markBox.width) / 2),
      right: markSide - markBox.width - Math.round((markSide - markBox.width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  const squareBuf = await squareMark.png().toBuffer();

  for (const [size, file, used] of [
    [512, join(BRAND, "mark-512.png"), "source for anything larger; press and print"],
    [192, join(BRAND, "mark-192.png"), "PWA / Android home screen"],
    [64, join(BRAND, "mark-64.png"), "console sidebar, sign-in card"],
    [32, join(BRAND, "mark-32.png"), "site header, table rows"],
  ] as [number, string, string][]) {
    const out = await sharp(squareBuf).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();
    writeFileSync(file, out);
    note(file.replace(resolve(".") + "\\", "").replace(/\\/g, "/"), `${size}×${size}`, out.length, used);
  }

  // Next.js file conventions. app/icon.png becomes the tab icon at every size
  // the browser asks for, and it REPLACES the scaffolding favicon.ico — which
  // is why that file is deleted rather than left to win the race.
  const icon = await sharp(squareBuf).resize(512, 512).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(APP, "icon.png"), icon);
  note("app/icon.png", "512×512", icon.length, "browser tab, bookmarks — Next.js app icon convention");

  // Apple draws its own rounded mask edge to edge and puts no padding in, so
  // this is the one output that gets deliberate breathing room and an opaque
  // ground. A transparent apple-touch icon renders black on iOS.
  const apple = await sharp(squareBuf)
    .resize(160, 160, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(APP, "apple-icon.png"), apple);
  note("app/apple-icon.png", "180×180", apple.length, "iOS home screen — opaque, with the padding Apple does not add");

  // The horizontal lockup, trimmed. Two versions: transparent for placing on
  // the report's own paper, and flattened white for surfaces that cannot
  // composite (some email clients, some Office templates).
  const lockup = sharp(lockTransparent ? lockSrc : lockFlat).extract(lockBox);
  const lockupBuf = await lockup.png().toBuffer();

  for (const [w, file, used] of [
    [1600, join(BRAND, "lockup-1600.png"), "press kit, slide masters, large print"],
    [800, join(BRAND, "lockup-800.png"), "letterhead at 2× — what the PDF renderer inlines"],
    [400, join(BRAND, "lockup-400.png"), "web header on light ground, email signature"],
  ] as [number, string, string][]) {
    const out = await sharp(lockupBuf).resize({ width: w }).png({ compressionLevel: 9 }).toBuffer();
    writeFileSync(file, out);
    const m = await sharp(out).metadata();
    note(file.replace(resolve(".") + "\\", "").replace(/\\/g, "/"), `${m.width}×${m.height}`, out.length, used);
  }

  // Flattened onto white, for anywhere that cannot composite an alpha channel.
  const flat = await sharp(lockupBuf).resize({ width: 800 }).flatten({ background: "#ffffff" }).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(BRAND, "lockup-800-white.png"), flat);
  note("public/brand/lockup-800-white.png", "800×w", flat.length, "email clients and Office templates that drop alpha");

  // The share card. 1200×630 is what WhatsApp, LinkedIn and X all crop from.
  //
  // On PAPER, not on the console's near-black ground. The wordmark's "Inter" is
  // navy #003868, which against #040605 measures under 2:1 and reads as a smear
  // at the size a WhatsApp preview renders. The artwork was drawn for light
  // surfaces and the share card respects that rather than fighting it.
  //
  // Text is drawn as SVG paths rather than as <text>, because SVG text is
  // rasterised through fontconfig and there is no guarantee about which faces a
  // build machine has. A tagline that silently falls back to a system serif on
  // one machine and renders correctly on another is worse than no tagline.
  const rule = await sharp({ create: { width: 1040, height: 2, channels: 4, background: { r: 0, g: 56, b: 104, alpha: 0.18 } } }).png().toBuffer();
  const bar = await sharp({ create: { width: 1200, height: 14, channels: 4, background: { r: 64, g: 152, b: 40, alpha: 1 } } }).png().toBuffer();
  const barNavy = await sharp({ create: { width: 600, height: 14, channels: 4, background: { r: 0, g: 56, b: 104, alpha: 1 } } }).png().toBuffer();
  const og = await sharp({
    create: { width: 1200, height: 630, channels: 4, background: { r: 252, g: 252, b: 251, alpha: 1 } },
  })
    .composite([
      { input: await sharp(lockupBuf).resize({ width: 880 }).toBuffer(), left: 80, top: 226 },
      { input: rule, left: 80, top: 430 },
      { input: bar, left: 0, top: 616 },
      { input: barNavy, left: 0, top: 616 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(BRAND, "og-1200x630.png"), og);
  note("public/brand/og-1200x630.png", "1200×630", og.length, "WhatsApp, LinkedIn and X link previews");

  // The palette, as data. The report kit, the console theme and the docs all
  // read this rather than each keeping their own copy of a hex value.
  const palette = {
    source: "Sampled from public/brand/logo-favicon.png and logo.png on 18 Sep 2026.",
    navy: NAVY,
    navyMid: "#185098",
    green: GREEN,
    greenLight: "#40A030",
    ink: "#0B0B0B",
    paper: "#FCFCFB",
    consoleGround: "#040605",
    note: "Navy carries structure and type; green carries movement and success. Neither is used for warnings — those stay amber and red, which is why the arrears ramp in the report kit is a separate single-hue scale.",
  };
  writeFileSync(join(BRAND, "palette.json"), JSON.stringify(palette, null, 2) + "\n");
  note("public/brand/palette.json", "—", 0, "one source for the brand hex values");

  console.log("\n  written:");
  for (const w of written) {
    console.log(`    ${w.file.padEnd(38)} ${w.size.padEnd(11)} ${w.bytes ? `${(w.bytes / 1024).toFixed(1)} KB`.padStart(9) : "".padStart(9)}   ${w.used}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
