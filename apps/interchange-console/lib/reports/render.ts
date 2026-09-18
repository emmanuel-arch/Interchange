// ─────────────────────────────────────────────────────────────────────────────
// HTML → PDF, through whatever headless Chromium this host already has.
//
// No puppeteer and no playwright. Both would pull a ~200MB browser download
// into a repo whose whole deployment story is "one endpoint per member", and
// both would still be driving the same Chromium that is already installed. So
// the renderer shells out to the browser's own print pipeline and nothing else.
//
// ── THIS DOES NOT RUN ON VERCEL ──────────────────────────────────────────────
// A serverless function has no browser binary and no writable spawn. That is
// not a gap to paper over: the API answers JSON and HTML everywhere, and PDF
// only where `chromiumPath()` resolves. A member who needs a PDF from a
// serverless deployment gets a clear 503 naming the reason, not a broken file.
// The durable fix is a small render worker beside the Registry — the same shape
// as the CRB relay, for the same kind of reason.
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

export class RenderUnavailable extends Error {
  constructor() {
    super(
      "No headless Chromium on this host, so PDF cannot be rendered here. Set CHROMIUM_PATH, or request format=html " +
        "and print it, or call a deployment that has one.",
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
  if (!browser) throw new RenderUnavailable();

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
