// ─────────────────────────────────────────────────────────────────────────────
// HTML → PDF, through whatever headless Chromium this host already has.
//
// No puppeteer and no playwright. Both would pull a ~200MB browser download
// into a repo whose whole deployment story is "one endpoint per member", and
// both would still be driving the same Chromium that is already installed. So
// the renderer shells out to the browser's own print pipeline and nothing else.
//
// ── TWO RENDERERS, ONE FUNCTION ──────────────────────────────────────────────
// This file used to end with "THIS DOES NOT RUN ON VERCEL", and for a year that
// was the honest answer: a serverless function has no browser binary, so the
// API answered JSON and HTML everywhere and PDF only where `chromiumPath()`
// resolved. What that meant in practice, on 23 Sep 2026, is that an officer in
// the LMS console pressed "Request CRB report" on a real customer and was told
// "PDF rendering is not available on this deployment, so a bundle cannot be
// assembled" — a sentence about our hosting, in the middle of their work.
//
// So there are now two paths, and `htmlToPdf` picks between them:
//
//   LOCAL       A Chromium the host already has, driven through its own
//               `--print-to-pdf` pipeline. No driver, no download, and it is
//               what every build script in scripts/ uses. Preferred whenever a
//               binary exists, because it is faster and has no cold start.
//
//   SERVERLESS  @sparticuz/chromium-min + puppeteer-core. The browser is not in
//               the deployment — the -min package downloads a Brotli pack on
//               first use, unpacks it to /tmp and reuses it for the life of the
//               container. That is why the pack URL is configuration and not a
//               constant: it has to be somewhere fast and close to the region,
//               and a member running their own node will want their own copy.
//
// The RESULT of the two must be the same document, so the flag lists below are
// deliberately kept in step, and the font check at the bottom of this file is
// run against both — a serverless render that silently fell back to Times would
// be a worse outcome than the 503 it replaced.
//
// ── THE TRAPS, ALL OF THEM LEARNED THE HARD WAY ──────────────────────────────
//   · `--print-to-pdf` needs an ABSOLUTE path or it fails with access denied,
//     whatever the working directory is.
//   · `--run-all-compositor-stages-before-draw` or fills land half-painted.
//   · A `file://` URL, not stdin: Chromium will not print a piped document.
//   · WOFF2 @font-face silently fails to decode in this build. The shell embeds
//     WOFF v1 for exactly that reason; `verifyFonts()` below proves it landed
//     rather than trusting it.
// ─────────────────────────────────────────────────────────────────────────────
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";

const run = promisify(execFile);

/**
 * One browser profile, reused across renders in this process.
 *
 * Every render used to get a fresh --user-data-dir inside its own temp folder,
 * which makes Chromium do first-run setup — profile creation, preference
 * writes, cache warm-up — on every single report. Reusing one directory keeps
 * that cost to the first render of the process.
 *
 * It is still a THROWAWAY profile in the system temp directory, not a user's
 * real one: the renderer must never pick up a signed-in session, an extension
 * or a proxy setting from a human's browser.
 */
const PROFILE_DIR = join(tmpdir(), "interchange-render-profile");

/** Candidate browsers, in the order a Windows workstation is likely to have them. */
const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean) as string[];

export function chromiumPath(): string | null {
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

/**
 * The Brotli pack the -min package inflates on a cold start.
 *
 * Defaulted rather than required, because a deployment that has to be told an
 * environment variable before it can render is a deployment that renders
 * nothing on the day it is first needed — which is precisely the failure this
 * whole path exists to remove. The default is the upstream release matching the
 * installed `@sparticuz/chromium-min`; the two MUST be bumped together, since
 * the package refuses a pack it did not expect.
 *
 * Point CHROMIUM_PACK_URL at your own copy (S3, R2, a Vercel Blob) to take the
 * cold start off the public internet. A member running their own node should.
 */
const PACK_VERSION = "v153.0.0";
export const chromiumPackUrl = () =>
  process.env.CHROMIUM_PACK_URL?.trim() ||
  `https://github.com/Sparticuz/chromium/releases/download/${PACK_VERSION}/chromium-${PACK_VERSION}-pack.x64.tar`;

/**
 * Is this a serverless runtime, where the -min path is the only one available?
 *
 * Vercel and Lambda both set their own marker. The explicit opt-out exists
 * because the fallback downloads ~50MB on a cold start, and an operator who
 * would rather answer 503 than pay that latency is making a legitimate choice.
 */
function serverless(): boolean {
  if (process.env.INTERCHANGE_PDF_SERVERLESS === "off") return false;
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.INTERCHANGE_PDF_SERVERLESS === "on");
}

/**
 * Can this deployment produce a PDF at all?
 *
 * The one predicate every caller should ask. `chromiumPath()` is still exported
 * for the build scripts, which genuinely do want to know whether there is a
 * LOCAL browser — but a route that used it as "can I render?" was answering a
 * narrower question than it was asking, and that is exactly how the refusal in
 * the header came to be shown on a host that could in fact render.
 */
export function canRenderPdf(): boolean {
  return Boolean(chromiumPath()) || serverless();
}

/** Which renderer a call would take right now. Reported in diagnostics. */
export function rendererKind(): "local" | "serverless" | "none" {
  if (chromiumPath()) return "local";
  return serverless() ? "serverless" : "none";
}

export class RenderUnavailable extends Error {
  constructor() {
    super(
      "No headless Chromium on this host and the serverless renderer is switched off, so PDF cannot be rendered " +
        "here. Set CHROMIUM_PATH to a local browser, or INTERCHANGE_PDF_SERVERLESS=on to inflate one at runtime, " +
        "or request format=html and print it.",
    );
    this.name = "RenderUnavailable";
  }
}

/**
 * Render a document to PDF bytes.
 *
 * The HTML is written to a temp directory rather than passed as a data: URL
 * because a report with ten embedded font faces exceeds the command-line length
 * limit on Windows long before it exceeds anything else.
 */
export async function htmlToPdf(html: string, opts: { timeoutMs?: number } = {}): Promise<Buffer> {
  const browser = chromiumPath();
  if (!browser) {
    if (!serverless()) throw new RenderUnavailable();
    return htmlToPdfServerless(html, opts);
  }

  const dir = await mkdtemp(join(tmpdir(), "interchange-report-"));
  const htmlPath = join(dir, "report.html");
  const pdfPath = join(dir, "report.pdf");

  try {
    await writeFile(htmlPath, html, "utf8");
    await run(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        "--print-to-pdf-no-header",
        "--run-all-compositor-stages-before-draw",
        // A report is static: nothing waits on the network, so a short virtual
        // clock is enough and keeps a stuck render from hanging a request.
        "--virtual-time-budget=4000",
        // Startup work a report render never needs. Measured at ~4s per render
        // on this box, most of it browser start-up rather than layout.
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--mute-audio",
        `--user-data-dir=${PROFILE_DIR}`,
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { timeout: opts.timeoutMs ?? 60_000, windowsHide: true },
    );
    return await readFile(pdfPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The serverless renderer.
 *
 * Imported dynamically for a reason worth stating: these two packages are the
 * heaviest things this repo depends on, and a static import would pull them
 * into every build that merely touches the reports module — including the CLI
 * scripts, which run on a workstation that has a real browser and needs neither.
 * The import only happens on a host that has already decided it has no browser.
 *
 * ── THE FLAGS ARE NOT THE LOCAL ONES, AND SHOULD NOT BE ──────────────────────
 * `chromium.args` from the -min package is a maintained list for exactly this
 * environment — the single-process, no-sandbox, no-dev-shm set that a Lambda
 * filesystem actually needs. Pasting the local `--print-to-pdf` flags in here
 * would fight it. What DOES carry over is the intent behind two of them:
 * headers and footers off (puppeteer's default, and asserted anyway), and
 * backgrounds on, without which every fill in the report prints white.
 */
async function htmlToPdfServerless(html: string, opts: { timeoutMs?: number } = {}): Promise<Buffer> {
  const [{ default: chromium }, puppeteer] = await Promise.all([
    import("@sparticuz/chromium-min"),
    import("puppeteer-core"),
  ]);

  // A report is a static document — no WebGL, no canvas 3D — and the graphics
  // stack costs a swiftshader extraction on every cold start to serve it.
  chromium.setGraphicsMode = false;

  const executablePath = await chromium.executablePath(chromiumPackUrl());
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
    // The pack download is the cold start, and it is measured in tens of
    // seconds on a cold container. The route's maxDuration is 120s.
    timeout: opts.timeoutMs ?? 60_000,
  });

  try {
    const page = await browser.newPage();
    // setContent, not a data: URL or a temp file: the document carries its own
    // embedded fonts as data URIs, so there is nothing to fetch and nothing to
    // wait for beyond layout. `networkidle0` would sit out its own timeout on a
    // page that never makes a request.
    await page.setContent(html, { waitUntil: "load", timeout: opts.timeoutMs ?? 60_000 });
    // The faces are data URIs, but the decode still has to finish before the
    // first paint or the PDF embeds the fallback — the same failure the WOFF2
    // note at the top of this file describes, arriving by a different road.
    await page.evaluateHandle("document.fonts.ready");
    const pdf = await page.pdf({
      // The document sets `@page { size: A4; margin: … }` in lib/reports/shell.ts,
      // and that is the size the whole layout is measured in millimetres against.
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Read the embedded font names back out of a finished PDF.
 *
 * This exists because the failure it catches is INVISIBLE: when the faces do
 * not decode, the PDF renders perfectly in Times New Roman and nobody notices
 * until a lender asks why the report looks like a fax. If this returns
 * TimesNewRomanPSMT or ArialMT where Sora was expected, the document is wrong
 * however good it looked in a browser.
 */
export function embeddedFonts(pdf: Buffer): string[] {
  const text = pdf.toString("latin1");
  const names = [...text.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+#_-]+)/g)].map((m) =>
    m[1].replace(/^[A-Z]{6}\+/, "").replace(/#20/g, " "),
  );
  return [...new Set(names)].sort();
}

/**
 * How many pages the finished PDF has.
 *
 * The FIRST `/Count` in the file is not the answer. Chromium writes a page
 * tree, and on a document long enough to be split into intermediate nodes the
 * first `/Count` it emits is that of a sub-node — a ten-page report reported as
 * eight, quietly, in every build log that printed it. The largest `/Count` is
 * the root of the tree and is the real total.
 *
 * `/Type /Page` cannot simply be counted instead: `/Pages` contains it as a
 * substring, and the two are not always written with the spacing a naive
 * pattern expects.
 */
export function pageCount(pdf: Buffer): number | null {
  const counts = [...pdf.toString("latin1").matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (!counts.length) return null;
  return Math.max(...counts);
}

/** True when the rendered PDF actually carries the intended faces. */
export function fontsLanded(pdf: Buffer): { ok: boolean; fonts: string[]; fellBack: boolean } {
  const fonts = embeddedFonts(pdf);
  const fellBack = fonts.some((f) => /TimesNewRoman|ArialMT|LiberationSerif/i.test(f));
  const intended = fonts.some((f) => /Sora|SourceSerif|JetBrainsMono/i.test(f));
  return { ok: intended && !fellBack, fonts, fellBack };
}
