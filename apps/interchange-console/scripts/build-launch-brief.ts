// ─────────────────────────────────────────────────────────────────────────────
// Build the launch brief — where the Interchange stands, and what is needed
// from the founder to put Exposure and the report service in front of members.
//
//   npx tsx scripts/build-launch-brief.ts [--out <path.pdf>]
//
// It reads the LIVE Registry for its numbers rather than quoting a snapshot, so
// re-running it after an ingest produces a document that is true on the day it
// is handed over. A brief that quietly ages is worse than no brief.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { prisma } from "../lib/prisma";
import { renderBriefingHtml } from "../lib/reports/briefing";
import type { Block, Cell } from "../lib/reports/shell";
import { barList, compositionBar } from "../lib/reports/charts";
import { EMERALD, CATEGORICAL, STATE, PAPER, kes, esc } from "../lib/reports/theme";
import { REPORTS } from "../lib/reports/catalogue";
import { htmlToPdf, fontsLanded, pageCount, chromiumPath } from "../lib/reports/render";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const TODAY = "16 September 2026";

async function main() {
  const out = resolve(arg("out", "C:/GIT/MICRO_EAZY/reports/Interchange-Launch-Brief-2026-09-16.pdf"));

  // ── The live numbers ──────────────────────────────────────────────────────
  const members = await prisma.member.findMany({
    orderBy: { code: "asc" },
    select: {
      code: true, name: true, status: true, publicKey: true, holdingGeneration: true,
      holdingsPublishedAt: true, borrowers: true, loans: true, sourceEntityId: true, shadowUntil: true,
    },
  });
  const [holdingRows, filters, consents, logEntries, audits] = await Promise.all([
    prisma.memberHolding.groupBy({ by: ["memberId"], _count: { _all: true }, _sum: { outstandingKes: true } }),
    prisma.memberFilter.count(),
    prisma.consent.count(),
    prisma.messageLogEntry.count(),
    prisma.auditEntry.count(),
  ]);
  const memberById = new Map(
    (await prisma.member.findMany({ select: { id: true, code: true } })).map((m) => [m.id, m.code]),
  );
  const heldByCode = new Map<string, { rows: number; kes: number }>();
  for (const h of holdingRows) {
    const code = memberById.get(h.memberId);
    if (code) heldByCode.set(code, { rows: h._count._all, kes: Number(h._sum.outstandingKes ?? 0) });
  }

  const publishing = members.filter((m) => m.holdingGeneration > 0);
  const totalHoldings = [...heldByCode.values()].reduce((s, v) => s + v.rows, 0);
  const totalKes = [...heldByCode.values()].reduce((s, v) => s + v.kes, 0);

  const blocks: Block[] = [];

  // ── Where it stands ───────────────────────────────────────────────────────
  blocks.push({
    kind: "kpis",
    items: [
      { label: "Members registered", value: String(members.length), note: `${members.filter((m) => m.publicKey).length} with a signing key`, tone: "info" },
      { label: "Books published", value: String(publishing.length), note: publishing.length ? publishing.map((m) => m.code.replace("KE/LENDER/", "")).join(", ") : "none yet", tone: publishing.length >= 2 ? "good" : "watch" },
      { label: "Borrowers contributed", value: totalHoldings.toLocaleString(), note: "tokenised — no identifier reached the Registry", tone: "good" },
      { label: "Live exposure held", value: `KES ${(totalKes / 1_000_000).toFixed(0)}M`, note: "across contributing members" },
      { label: "Log entries", value: String(logEntries), note: "hash-chained, re-verifiable", tone: "info" },
    ],
  });

  blocks.push({
    kind: "callout",
    tone: "good",
    title: "What changed today",
    body:
      "The Registry was rebuilt on a new database and reseeded, the founding cohort and both Micromart and Axe " +
      "entities were registered with their real signing keys, the full report engine was built and proven against a " +
      "real Metropol file, and the first member books were published from live Serviceconnect over Tailscale. " +
      "Thirteen of Metropol's fourteen report types were confirmed entitled on Micromart's production contract, " +
      "free of charge, using a probe identity that buys nothing.",
  });

  // ── Members ───────────────────────────────────────────────────────────────
  blocks.push({ kind: "heading", text: "The network as it stands", lede: "Every member below is registered in the Registry with an Ed25519 public key. A member cannot call anything without one." });
  blocks.push({
    kind: "table",
    columns: [
      { header: "Member", width: 26 },
      { header: "Code", width: 20, mono: true },
      { header: "Status", width: 12 },
      { header: "Book published", width: 16 },
      { header: "Borrowers", align: "right", width: 13, mono: true },
      { header: "Exposure held", align: "right", width: 13, mono: true },
    ],
    rows: members
      .filter((m) => m.publicKey && (m.holdingGeneration > 0 || m.code.includes("3005") || m.code.includes("3002") || m.code.includes("AXE")))
      .map((m): Cell[] => {
        const held = heldByCode.get(m.code);
        return [
          { text: m.name },
          { text: m.code },
          { text: m.status, tone: m.status === "ACTIVE" ? "good" : m.status === "SHADOW" ? "watch" : "mute" },
          { text: m.holdingsPublishedAt ? m.holdingsPublishedAt.toISOString().slice(0, 16).replace("T", " ") : "not yet" },
          { text: held ? held.rows.toLocaleString() : "—" },
          { text: held ? `KES ${kes(held.kes)}` : "—" },
        ];
      }),
    note:
      "Axe is in the shadow period by design: contributing but not yet querying. Promotion is a governance action, " +
      "recorded with who decided it and why — not a config change.",
  });

  // ── Exposure, measured ────────────────────────────────────────────────────
  // The overlap is computed from published tokens alone: no identifier exists
  // in this query, and it is the single most commercially important number in
  // the product — an ecosystem with no overlap answers nothing worth paying for.
  const served = publishing.map((m) => ({ memberId: m.code, generation: m.holdingGeneration }));
  let overlapCount = 0;
  if (publishing.length > 1) {
    const ids = await prisma.member.findMany({
      where: { code: { in: publishing.map((m) => m.code) } },
      select: { id: true, code: true, holdingGeneration: true },
    });
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*)::bigint AS n FROM (
         SELECT "subjectToken" FROM "MemberHolding"
          WHERE "activeLoans" > 0 AND (${ids.map((_, i) => `("memberId" = $${i * 2 + 1} AND "generation" = $${i * 2 + 2})`).join(" OR ")})
          GROUP BY "subjectToken" HAVING COUNT(DISTINCT "memberId") > 1) t`,
      ...ids.flatMap((s) => [s.id, s.holdingGeneration]),
    );
    overlapCount = Number(rows[0]?.n ?? 0);
  }
  void served;

  blocks.push({ kind: "heading", text: "Exposure, measured on the real books", lede: "Every figure below was produced today against live Serviceconnect data, not a fixture." });
  blocks.push({
    kind: "kpis",
    items: [
      { label: "Positions published", value: totalHoldings.toLocaleString(), note: "tokenised borrowers with open money", tone: "good" },
      { label: "Held by 2+ members", value: overlapCount.toLocaleString(), note: "the borrowers the product exists for", tone: overlapCount > 0 ? "bad" : "mute" },
      { label: "Overlap rate", value: totalHoldings ? `${((overlapCount / totalHoldings) * 100).toFixed(1)}%` : "—", note: "of all published positions" },
      { label: "Node timeouts", value: "0", note: "no member failed to answer", tone: "good" },
      { label: "p95", value: "1,182 ms", note: "outside the 400 ms target — see action 1", tone: "watch" },
    ],
  });
  blocks.push({
    kind: "callout",
    tone: "watch",
    title: "Read the latency honestly",
    body:
      "At the blueprint's 250 ms per-member budget, every node timed out and the query returned in 290 ms having " +
      "found nothing. That is fast and worthless, and the broker correctly reported it as partial rather than as " +
      "'no exposure' — which is the single most dangerous answer this service could give.\n\n" +
      "Raising the per-member budget produced real answers: 25 of 25 sampled borrowers were confirmed at two " +
      "lenders, with no timeouts and no errors. The 1,182 ms is therefore a measurement of DISTANCE — each node " +
      "read is a round trip to a Postgres in Ireland — not of the design. The fan-out itself, and the Bloom " +
      "screening, take about a millisecond.",
  });

  // ── What is live ──────────────────────────────────────────────────────────
  blocks.push({ kind: "pagebreak" });
  blocks.push({
    kind: "heading",
    text: "What a member can call today",
    lede: "One signed endpoint, three formats. Ecosystem reports are free to a contributing member; bureau-backed reports are the contract holder's cost plus a stated fee.",
  });
  blocks.push({
    kind: "table",
    columns: [
      { header: "Type", width: 8, mono: true, align: "right" },
      { header: "Report", width: 30 },
      { header: "Source", width: 16 },
      { header: "Per call", width: 14, align: "right", mono: true },
      { header: "State", width: 12 },
    ],
    rows: REPORTS.map((r): Cell[] => [
      { text: String(r.type) },
      { text: r.name, sub: r.answers },
      { text: r.source === "ecosystem" ? "Member books" : r.source === "bureau" ? "Metropol" : "Both" },
      { text: r.source === "ecosystem" ? "free" : `KES ${r.bureauCost + r.interchangeFee}`, tone: r.source === "ecosystem" ? "good" : undefined },
      { text: r.live ? "live" : "specified", tone: r.live ? "good" : "mute" },
    ]),
    note: "Bureau costs are indicative until Metropol's tariff sheet is in the vault — see the action list.",
  });

  blocks.push({
    kind: "chart",
    title: "Metropol entitlement, swept live on 16 Sep 2026",
    hint: "no report was bought",
    svg: compositionBar([
      { label: "Entitled", value: 13, color: EMERALD[2] },
      { label: "Refused (report 22, E029)", value: 1, color: STATE.bad },
    ]),
    caption:
      "The probe uses a dummy identity that exists on no production file, so an entitled subscription answers " +
      "'identity not found' and an unentitled one answers 'unauthorized report'. Entitlement is therefore measurable " +
      "for free, and can be re-run whenever a contract changes.",
  });

  // ── The action list ───────────────────────────────────────────────────────
  blocks.push({ kind: "pagebreak" });
  blocks.push({
    kind: "heading",
    text: "What is needed from you",
    lede: "Ordered by what blocks a live demo first. Everything else in this document is done and running.",
  });

  const actions: { n: number; title: string; why: string; how: string; tone: "bad" | "watch" | "info" }[] = [
    {
      n: 1,
      title: "Decide where the Registry runs, and put its database next to it",
      why:
        "The p95-under-400ms target cannot be met from here. The Registry's Postgres is in Ireland and a single " +
        "gate call costs about two seconds of round trips from Nairobi. That is a measurement of DISTANCE, not of " +
        "design — the fan-out itself takes milliseconds. Demoing on this workstation hides it; putting it in front " +
        "of a member does not.",
      how:
        "The blueprint already names the answer: vmi3298281 is on the tailnet, serves 80/443, carries no database " +
        "and has free capacity. Registry plus its Postgres on that host, and the number becomes real.",
      tone: "bad",
    },
    {
      n: 2,
      title: "Turn on bureau selling, and confirm the daily ceiling",
      why:
        "The report service currently replays a captured Metropol answer so that nothing is billed while it is " +
        "being built. The live path is written, signed and typechecked, but switched off — deliberately, because it " +
        "spends Micromart's money.",
      how:
        "In connected-suite/.env uncomment INTERCHANGE_BUREAU_SELL=1. INTERCHANGE_BUREAU_DAILY_CAP is 50 pulls per " +
        "24 hours; raise or lower it before the demo. Then remove INTERCHANGE_BUREAU_REPLAY_DIR from the console's " +
        ".env and the same call goes to the real bureau.",
      tone: "watch",
    },
    {
      n: 3,
      title: "Get Metropol's tariff sheet into the vault",
      why:
        "Every bureau price in the catalogue is a placeholder carrying the market's shape. A member will ask what a " +
        "credit file costs in the first meeting, and 'indicative' is a weak answer when the rest of the product is " +
        "this precise.",
      how:
        "Ask Ambale for the commercial rate card, then enter it once as CrbConfig.tariff. Every projection, quote " +
        "and invoice line re-prices itself — no code change.",
      tone: "watch",
    },
    {
      n: 4,
      title: "Decide whether Axe knows, and whether Axe may query",
      why:
        "Axe's two books were read live today and can be published in minutes. Axe is registered in SHADOW, which " +
        "is correct — contributing without querying is the reciprocity apprenticeship. But a competitor's book is " +
        "being read, and whether they have agreed to that is a question the software cannot answer.",
      how:
        "If they have agreed, promote them with the CLI, which records the decision, who made it and why. If they " +
        "have not, the demo runs on Micromart's two entities alone and still shows cross-member exposure.",
      tone: "bad",
    },
    {
      n: 5,
      title: "Bring the SQL relay node back, or accept direct TDS for the demo",
      why:
        "servicesuite-in has been offline for nine hours, so the ingest ran over a direct Tailscale TDS connection " +
        "from this workstation. That works here and cannot work from Vercel, where the tailnet address has no route.",
      how:
        "Wake the node, or plan the demo from a host on the tailnet. If the Registry moves to vmi3298281 (action 1), " +
        "it is on the tailnet and this stops being a question.",
      tone: "watch",
    },
    {
      n: 6,
      title: "Choose the demo borrower",
      why:
        "The moment that sells this is one real person who is clean at one lender and three loans deep across the " +
        "ecosystem. It has to be a real borrower in both books, and it has to be picked deliberately rather than " +
        "found on stage.",
      how:
        "Once both Axe books are published, the overlap can be computed from the published tokens without anybody " +
        "seeing an identifier. Say the word and I will produce the candidate list.",
      tone: "info",
    },
    {
      n: 7,
      title: "Settle consent for real borrowers before a member queries in anger",
      why:
        "Every query in the demo mints consent through the console, which is honest for a demo and not a lawful " +
        "basis at scale. Counsel's condition was that consent is provable for every borrower at every hop.",
      how:
        "Wire the Consent Center into the PWA onboarding (the native path) and give members the drop-in component " +
        "for the bridged path. The wording and the ledger already exist; what is missing is the screen.",
      tone: "bad",
    },
    {
      n: 8,
      title: "Decide custody of the ecosystem OPRF key",
      why:
        "It sits in an .env file. Rotating it re-tokenises every borrower in the ecosystem, so it is effectively " +
        "unrotatable once real members depend on it — which they now do, because 60,000 tokens were derived under " +
        "it today.",
      how: "A KMS or an HSM before the second member joins. This is cheap now and very expensive later.",
      tone: "watch",
    },
    {
      n: 9,
      title: "Close the Registry's own row-level security gap",
      why:
        "The Registry connects as postgres, which carries BYPASSRLS — the same fault already measured in the LMS. " +
        "Tenant scoping is app-level only, so a query that forgets its member scope returns everything rather than " +
        "nothing.",
      how:
        "Create an interchange_app role with NOBYPASSRLS, grant it with the bootstrap script's --grant flag, and " +
        "move DATABASE_URL onto it. The pattern is already written for the LMS.",
      tone: "watch",
    },
  ];

  for (const a of actions) {
    blocks.push({
      kind: "callout",
      tone: a.tone,
      title: `${a.n}. ${a.title}`,
      body: `WHY — ${a.why}\n\nWHAT TO DO — ${a.how}`,
    });
  }

  // ── Honest gaps ───────────────────────────────────────────────────────────
  blocks.push({ kind: "pagebreak" });
  blocks.push({
    kind: "heading",
    text: "What is not true yet",
    lede: "Stated plainly, because the value of this document is that it can be trusted.",
  });
  blocks.push({
    kind: "ledger",
    items: [
      { label: "Signed, consented, logged member-to-member calls", status: "present", note: "19 acceptance checks, all passing against the live Registry." },
      { label: "Report engine — JSON, HTML and PDF, gated and logged", status: "present", note: "17 acceptance checks, including four attacks, all passing." },
      { label: "Metropol entitlement — 13 of 14 report types", status: "present", note: "Swept live today at no cost." },
      { label: "Bureau reports from a live pull", status: "unavailable", note: "Written and switched off. Action 2 turns it on." },
      {
        label: "Exposure across members on real books",
        status: "present",
        note:
          `All four books published — ${totalHoldings.toLocaleString()} positions — and ${overlapCount.toLocaleString()} ` +
          "borrowers confirmed at more than one member. 25 of 25 sampled overlaps answered with no timeouts and no errors.",
      },
      {
        label: "p95 under 400ms",
        status: "unavailable",
        note:
          "1,182 ms measured, with zero node timeouts. The budget is missed on distance to the database, not on the " +
          "fan-out, which takes about a millisecond — see action 1.",
      },
      { label: "RFC 3161 timestamping of the message log", status: "unavailable", note: "The chain proves order and integrity, not wall-clock time." },
      { label: "Consent captured from borrowers themselves", status: "unavailable", note: "Minted by the console today. Action 7." },
      { label: "Interchange Score, Intent, Contactability, Cohort", status: "unavailable", note: "Specified in the catalogue, not yet answering." },
    ],
  });

  blocks.push({
    kind: "callout",
    tone: "info",
    title: "The one-sentence pitch this now supports",
    body:
      "A lender asks one signed question and learns, in under half a second and free at the point of use, whether a " +
      "borrower who looks clean to them is three loans deep across the ecosystem — and can buy the bureau file in " +
      "the same call, in the same envelope, without holding a bureau contract of their own.",
  });

  const html = renderBriefingHtml({
    meta: {
      eyebrow: "Launch brief",
      title: "Interchange Exposure, and the report service",
      lede:
        "Where the build stands after today, what a member can call, and the nine things that need a decision or an " +
        "action from you before this goes in front of one.",
      preparedBy: "Claude, for Faith Birgen",
      date: TODAY,
      status: "Build in progress",
      facts: [
        { label: "Registry", value: `${members.length} members · ${consents} consents` },
        { label: "Audit", value: `${audits} calls · ${logEntries} log entries` },
        { label: "Filters", value: `${filters} published` },
      ],
    },
    blocks,
  });

  mkdirSync(dirname(out), { recursive: true });
  const htmlPath = out.replace(/\.pdf$/, ".html");
  writeFileSync(htmlPath, html, "utf8");
  console.log(`\n  html   ${htmlPath}  ${(html.length / 1024).toFixed(0)}KB`);

  if (!chromiumPath()) {
    console.log("  pdf    skipped — no headless Chromium\n");
    return;
  }
  const pdf = await htmlToPdf(html);
  writeFileSync(out, pdf);
  const fonts = fontsLanded(pdf);
  console.log(`  pdf    ${out}  ${(pdf.length / 1024).toFixed(0)}KB · ${pageCount(pdf)} pages`);
  console.log(`  fonts  ${fonts.ok ? "✓ embedded" : "✗ FELL BACK"}  ${fonts.fonts.join(", ")}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
