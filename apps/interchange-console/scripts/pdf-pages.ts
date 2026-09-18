// Print the page count of every PDF given, using the same helper the build
// scripts report from. Exists because that helper silently under-reported for
// months and nothing compared it against a second opinion.
//
//   npx tsx scripts/pdf-pages.ts <file-or-dir> [...]
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { pageCount } from "../lib/reports/render";

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("Give me files or directories.");
  process.exit(1);
}

for (const t of targets) {
  const files = statSync(t).isDirectory()
    ? readdirSync(t).filter((f) => f.toLowerCase().endsWith(".pdf")).map((f) => join(t, f))
    : [t];
  for (const f of files) {
    const buf = readFileSync(f);
    console.log(`${String(pageCount(buf)).padStart(3)} pages  ${(buf.length / 1024).toFixed(0).padStart(5)} KB  ${f}`);
  }
}
