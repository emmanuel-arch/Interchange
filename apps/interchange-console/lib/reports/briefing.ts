// ─────────────────────────────────────────────────────────────────────────────
// BRIEFINGS — the same document system, without a borrower.
//
// A credit report has a subject, a consent reference and a log receipt. A
// build plan, a member pack or a launch runbook has none of those, and forcing
// one through the report masthead produces a document with an empty provenance
// card and a subject token of zeroes.
//
// So a briefing gets its own masthead and reuses everything else: the same
// stylesheet, the same blocks, the same charts, the same faces. Two documents
// from this repo should be recognisably the same product even when one is a
// bureau file and the other is a plan.
// ─────────────────────────────────────────────────────────────────────────────
import { documentCss, renderBlocks, mark, type Block } from "./shell";
import { esc } from "./theme";

export type BriefingMeta = {
  /** Small caps line above the title — "Launch runbook", "Member pack". */
  eyebrow: string;
  title: string;
  /** One paragraph under the title. The document's argument in a sentence. */
  lede?: string;
  preparedBy?: string;
  date: string;
  status?: string;
  /** Short facts for the card: audience, supersedes, related systems. */
  facts?: { label: string; value: string }[];
};

export type Briefing = { meta: BriefingMeta; blocks: Block[] };

export function renderBriefingHtml(doc: Briefing): string {
  const m = doc.meta;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(m.title)} · The Interchange</title>
<style>
${documentCss()}

/* A briefing's masthead is wider and quieter than a report's: there is no
   provenance to prove, so the title carries the page. */
.masthead h1 { font-size: 25pt; max-width: 150mm; }
.masthead .subtitle { max-width: 125mm; font-size: 10.2pt; }
.eyebrow { font-family: 'Sora', sans-serif; font-size: 7.4pt; font-weight: 700;
  letter-spacing: 0.26em; text-transform: uppercase; color: #0b5d4e; margin-top: 4mm; }
</style>
</head>
<body>
<header class="masthead">
  <div>
    <div class="brandline">${mark(20)}<span class="name">The Interchange</span></div>
    <div class="eyebrow">${esc(m.eyebrow)}</div>
    <h1>${esc(m.title)}</h1>
    ${m.lede ? `<p class="subtitle">${esc(m.lede)}</p>` : ""}
  </div>
  <div class="provenance">
    <dl>
      ${m.preparedBy ? `<dt>Prepared by</dt><dd>${esc(m.preparedBy)}</dd>` : ""}
      <dt>Date</dt><dd>${esc(m.date)}</dd>
      ${m.status ? `<dt>Status</dt><dd>${esc(m.status)}</dd>` : ""}
      ${(m.facts ?? []).map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join("")}
    </dl>
  </div>
</header>

<main>
${renderBlocks(doc.blocks)}
</main>

<footer class="footer">
  <div>The Interchange · ${esc(m.eyebrow)}</div>
  <div class="right">${esc(m.date)}</div>
</footer>
</body>
</html>`;
}
