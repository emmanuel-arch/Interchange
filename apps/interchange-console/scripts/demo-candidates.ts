// ─────────────────────────────────────────────────────────────────────────────
// Demo borrower candidates — launch brief action 6.
//
//   npx tsx scripts/demo-candidates.ts [--top 25] [--clean-at KE/LENDER/3002]
//
// The moment that sells the Interchange is one borrower who is CLEAN at the
// asking lender and several loans deep across the ecosystem. This finds them
// from published tokens and aggregates alone: no national ID, name or phone is
// read, and none is written. Output goes to reports/crb/ (git-ignored), because
// a token plus a lender's name is still the start of a trail to a person.
//
// Resolving a token to a real person happens only inside the member's own book,
// and putting a real person on stage needs that person's consent.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { prisma } from "../lib/prisma";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const CLEAN = new Set(["due", "prepayment"]);
const SEVERITY: Record<string, number> = { prepayment: 0, due: 0, watch_1: 1, watch_2: 2, watch_3: 3, npl: 4 };

type Position = { member: string; activeLoans: number; outstanding: number; bucket: string; newest: Date | null };

async function main() {
  const top = Number(arg("top", "25"));
  const cleanAt = arg("clean-at", "KE/LENDER/3002")!;

  const members = await prisma.member.findMany({
    where: { holdingGeneration: { gt: 0 } },
    select: { id: true, code: true, name: true, holdingGeneration: true },
  });
  const byId = new Map(members.map((m) => [m.id, m]));

  // Tokens that appear in more than one member's CURRENT generation.
  const multi = await prisma.$queryRawUnsafe<{ subjectToken: string; members: number }[]>(
    `SELECT h."subjectToken", COUNT(DISTINCT h."memberId")::int AS members
       FROM "MemberHolding" h
       JOIN "Member" m ON m.id = h."memberId" AND h.generation = m."holdingGeneration"
      GROUP BY h."subjectToken"
     HAVING COUNT(DISTINCT h."memberId") > 1`,
  );

  const tokens = multi.map((r) => r.subjectToken);
  const rows = [];
  for (let i = 0; i < tokens.length; i += 1000) {
    rows.push(
      ...(await prisma.memberHolding.findMany({
        where: { subjectToken: { in: tokens.slice(i, i + 1000) } },
        select: { memberId: true, subjectToken: true, activeLoans: true, outstandingKes: true, worstBucket: true, newestDisbursedAt: true, generation: true },
      })),
    );
  }

  const positions = new Map<string, Position[]>();
  for (const r of rows) {
    const m = byId.get(r.memberId);
    if (!m || r.generation !== m.holdingGeneration) continue;
    const list = positions.get(r.subjectToken) ?? [];
    list.push({ member: m.code, activeLoans: r.activeLoans, outstanding: r.outstandingKes, bucket: r.worstBucket, newest: r.newestDisbursedAt });
    positions.set(r.subjectToken, list);
  }

  const now = Date.now();
  const scored = [...positions.entries()]
    .map(([token, ps]) => {
      const home = ps.find((p) => p.member === cleanAt);
      const elsewhere = ps.filter((p) => p.member !== cleanAt);
      const loansElsewhere = elsewhere.reduce((s, p) => s + p.activeLoans, 0);
      const owedElsewhere = elsewhere.reduce((s, p) => s + p.outstanding, 0);
      const worstElsewhere = Math.max(0, ...elsewhere.map((p) => SEVERITY[p.bucket] ?? 0));
      const recent = elsewhere.filter((p) => p.newest && now - p.newest.getTime() < 90 * 86_400_000).length;
      return {
        token,
        cleanHome: !!home && CLEAN.has(home.bucket),
        lenders: ps.length,
        loansElsewhere,
        owedElsewhere,
        worstElsewhere,
        recent,
        // The story: clean here, several loans and real money elsewhere, recently.
        rank: loansElsewhere * 3 + Math.min(owedElsewhere / 10_000, 20) + recent * 2 + worstElsewhere,
        ps,
      };
    })
    .filter((c) => c.cleanHome && c.loansElsewhere > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, top);

  const band = (n: number) => (n <= 0 ? "none" : n < 10_000 ? "<10k" : n < 50_000 ? "10k–50k" : n < 200_000 ? "50k–200k" : "200k+");
  const lines = [
    `# Demo borrower candidates · ${new Date().toISOString()}`,
    `# Clean at ${cleanAt}, holding loans at another member. ${positions.size} tokens are held by 2+ members; ${scored.length} shown.`,
    `# Tokens only. Resolving one to a person happens inside the member's own book, and a real person on stage needs their consent.`,
    "",
    "rank\ttoken\tlenders\tloans_elsewhere\towed_elsewhere\tworst_elsewhere\tdisbursed_90d\tpositions",
    ...scored.map((c, i) =>
      [
        i + 1,
        `${c.token.slice(0, 16)}…`,
        c.lenders,
        c.loansElsewhere,
        band(c.owedElsewhere),
        Object.entries(SEVERITY).find(([, v]) => v === c.worstElsewhere)?.[0] ?? "due",
        c.recent,
        c.ps.map((p) => `${p.member}:${p.activeLoans}L/${band(p.outstanding)}/${p.bucket}`).join(" "),
      ].join("\t"),
    ),
  ];

  const dir = resolve("../../../reports/crb");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const txt = join(dir, `demo-candidates-${stamp}.tsv`);
  writeFileSync(txt, lines.join("\n") + "\n");
  // Full tokens, for the resolve step inside the member's book. Same folder, same git-ignore.
  writeFileSync(join(dir, `demo-candidates-${stamp}.tokens.json`), JSON.stringify(scored.map((c) => ({ token: c.token, rank: c.rank, positions: c.ps })), null, 2));

  console.log(lines.slice(0, 16).join("\n"));
  console.log(`\n  wrote ${txt}\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
