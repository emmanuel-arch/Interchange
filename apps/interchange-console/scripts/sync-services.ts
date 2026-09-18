// ─────────────────────────────────────────────────────────────────────────────
// Bring the Registry's Service rows in line with the report catalogue.
//
//   npx tsx scripts/sync-services.ts [--dry]
//
// The Directory is the `Service` table, and the gate reads `requiredScopes` from
// it — so a report that exists in lib/reports/catalogue.ts but has no Service row
// is refused with "Not subscribed", which reads like a permissions bug rather
// than a missing row.
//
// ── WHY NOT JUST RE-RUN THE SEED ─────────────────────────────────────────────
// prisma/seed.ts upserts MEMBERS as well, and its `update` branch writes the
// seeded borrower and loan counts back over whatever the members have since
// published. Re-running it to add one service would quietly replace Micromart
// Africa's real 59,968 contributed borrowers with a figure typed in August.
// This touches services and subscriptions only, and never members.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { REPORTS } from "../lib/reports/catalogue";

const DRY = process.argv.includes("--dry");

async function main() {
  console.log(`\nSyncing ${REPORTS.length} catalogue entries into the Directory${DRY ? " (dry run)" : ""}\n`);

  const active = await prisma.member.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, loans: true } });
  let created = 0;
  let updated = 0;
  let subscribed = 0;

  for (const r of REPORTS) {
    const existing = await prisma.service.findUnique({ where: { code: r.code } });
    const data = {
      name: r.name,
      kind: r.type === 20 ? ("QUERY" as const) : ("REPORT" as const),
      reportType: r.type,
      description: r.answers,
      requiredScopes: r.requiredScopes,
      live: r.live,
    };

    if (!existing) {
      if (!DRY) await prisma.service.create({ data: { code: r.code, ...data } });
      created++;
      console.log(`  + ${r.code.padEnd(14)} ${r.name.padEnd(26)} scopes: ${r.requiredScopes.join(", ")}`);
    } else if (
      existing.live !== r.live ||
      existing.reportType !== r.type ||
      JSON.stringify(existing.requiredScopes) !== JSON.stringify(r.requiredScopes)
    ) {
      if (!DRY) await prisma.service.update({ where: { code: r.code }, data });
      updated++;
      console.log(`  ~ ${r.code.padEnd(14)} ${r.name.padEnd(26)} live=${r.live}`);
    }

    // Every ACTIVE member is subscribed to every live service, with a free tier
    // indexed to contribution. Without a Subscription the gate answers
    // REFUSED_QUOTA, which is the correct outcome for an unsubscribed member and
    // a confusing one for a member who was never offered the service.
    const service = await prisma.service.findUnique({ where: { code: r.code }, select: { id: true } });
    if (!service || DRY) continue;
    for (const m of active) {
      const sub = await prisma.subscription.findUnique({
        where: { memberId_serviceId: { memberId: m.id, serviceId: service.id } },
      });
      if (!sub) {
        await prisma.subscription.create({
          data: { memberId: m.id, serviceId: service.id, freeTierPerDay: Math.max(50, Math.floor(m.loans / 100)) },
        });
        subscribed++;
      }
    }
  }

  console.log(`\n  ${created} created · ${updated} updated · ${subscribed} new subscriptions across ${active.length} active members\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
