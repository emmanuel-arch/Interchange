// How long does turning a report into a PDF actually take?
//
//   npx tsx scripts/bench-render.ts [--runs 3]
//
// The officer-facing latency of the report button is the sum of a bureau pull,
// a handful of database round trips and THIS. Guessing which one dominates is
// how the wrong thing gets optimised, so it is measured separately.
import "dotenv/config";
import { readFileSync } from "fs";
import { htmlToPdf, chromiumPath, pageCount } from "../lib/reports/render";

const RUNS = Number((() => { const i = process.argv.indexOf("--runs"); return i >= 0 ? process.argv[i + 1] : "3"; })());
const SAMPLE = "C:/GIT/MICRO_EAZY/reports/crb/Interchange-Credit-File-30058967-2026-09-16.html";

async function main() {
  if (!chromiumPath()) throw new Error("No headless Chromium on this host.");
  console.log(`\n  renderer: ${chromiumPath()}`);
  const html = readFileSync(SAMPLE, "utf8");
  console.log(`  document: ${(html.length / 1024).toFixed(0)}KB of HTML\n`);

  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = Date.now();
    const pdf = await htmlToPdf(html);
    const ms = Date.now() - t;
    times.push(ms);
    console.log(`  run ${i + 1}  ${String(ms).padStart(6)}ms  ${(pdf.length / 1024).toFixed(0)}KB · ${pageCount(pdf)} pages`);
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  console.log(`\n  mean ${avg}ms · min ${Math.min(...times)}ms · max ${Math.max(...times)}ms`);
  console.log(
    `\n  Every render starts a browser process, loads ~600KB of inlined fonts and prints.\n` +
      `  That cost is per REPORT, not per page, and it is the floor for any PDF this\n` +
      `  service returns synchronously.\n`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
