// ─────────────────────────────────────────────────────────────────────────────
// Registry seed — the real founding cohort, not fixtures.
//
// Book sizes are the figures pulled from the live servers on 21 Aug 2026
// (docs/FOUNDING-COHORT.md). Using the real numbers matters: a Directory seeded
// with round fake values hides the thing the cohort analysis actually showed —
// that Micromart is 3.6× the whole .198 server, and that an exposure check
// against one lender answers almost nothing.
//
// The .198 members are SEPARATE LEGAL ENTITIES inside one Serviceconnect
// database, partitioned by EntityID. Each gets its own Member row and its own
// sourceEntityId, because each is its own data controller and its own consent
// boundary — sharing a database does not make them one member.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { MANDATORY_SCOPES } from "../lib/consent/scopes";
// THE SHARED CLIENT, not a second one built here.
//
// This file used to construct its own: `new PrismaClient({ adapter: new
// PrismaPg({ connectionString: process.env.DATABASE_URL! }) })`. That works and
// it quietly opts out of the TLS guard in lib/prisma.ts — node-postgres speaks
// plaintext when the URL carries no `sslmode`, so seeding a hosted Registry sent
// the founding cohort across the internet in the clear. A second construction
// site is a second security posture; there should only be one.
import { prisma } from "../lib/prisma";

const SHARED_198 = { host: "213.148.17.198,4420", db: "Serviceconnect" };

type Seed = {
  code: string;
  name: string;
  status: "PROSPECT" | "SHADOW" | "ACTIVE" | "SUSPENDED";
  entityId?: number;
  host?: string;
  db?: string;
  borrowers: number;
  loans: number;
  daysSinceContribution?: number | null;
};

const MEMBERS: Seed[] = [
  // The anchor. Its own server, reached over Tailscale.
  {
    code: "KE/LENDER/3005",
    name: "Micromart Fintech",
    status: "ACTIVE",
    entityId: 3005,
    host: "100.72.35.56,4230",
    db: "Serviceconnect",
    borrowers: 17020,
    loans: 61503,
    daysSinceContribution: 0,
  },
  {
    code: "KE/LENDER/3002",
    name: "Micromart Africa",
    status: "ACTIVE",
    entityId: 3002,
    host: "100.72.35.56,4230",
    db: "Serviceconnect",
    borrowers: 141061,
    loans: 272789,
    daysSinceContribution: 0,
  },

  // The qualifying cohort on the shared .198 book.
  { code: "KE/LENDER/0003", name: "NJB", status: "ACTIVE", entityId: 3, borrowers: 13533, loans: 31775, daysSinceContribution: 0 },
  { code: "KE/LENDER/0008", name: "Buy Simu", status: "ACTIVE", entityId: 8, borrowers: 11867, loans: 13989, daysSinceContribution: 0 },
  { code: "KE/LENDER/0023", name: "ATICO AFRICA", status: "SHADOW", entityId: 23, borrowers: 3272, loans: 7109, daysSinceContribution: 0 },
  { code: "KE/LENDER/0022", name: "RIFT PLAN MICROENTERPRISES", status: "SHADOW", entityId: 22, borrowers: 1711, loans: 3277, daysSinceContribution: 0 },
  { code: "KE/LENDER/0025", name: "VILISHA ENT LIMITED", status: "SHADOW", entityId: 25, borrowers: 2175, loans: 3132, daysSinceContribution: 0 },
  { code: "KE/LENDER/0021", name: "Gemstar Ltd", status: "SHADOW", entityId: 21, borrowers: 1547, loans: 2649, daysSinceContribution: 0 },
  { code: "KE/LENDER/0006", name: "Brideway Ltd", status: "PROSPECT", entityId: 6, borrowers: 1362, loans: 1779, daysSinceContribution: 13 },
  { code: "KE/LENDER/0018", name: "Rolab Ventures Ltd", status: "PROSPECT", entityId: 18, borrowers: 426, loans: 1775, daysSinceContribution: 0 },
  { code: "KE/LENDER/0026", name: "Tanzu Microfinance", status: "PROSPECT", entityId: 26, borrowers: 1006, loans: 1651, daysSinceContribution: 1 },
  { code: "KE/LENDER/0014", name: "truways Company Ltd", status: "PROSPECT", entityId: 14, borrowers: 811, loans: 1494, daysSinceContribution: 2 },

  // Dormant — real closed-loan history, no live exposure. Training-data
  // contributors, deliberately NOT exchange members. See FOUNDING-COHORT.md.
  { code: "KE/LENDER/0005", name: "FOURSIGHT CAPITAL LIMITED", status: "SUSPENDED", entityId: 5, borrowers: 2060, loans: 2191, daysSinceContribution: 223 },
  { code: "KE/LENDER/0002", name: "Zuerst Africa Ltd", status: "SUSPENDED", entityId: 2, borrowers: 294, loans: 1440, daysSinceContribution: 659 },
  { code: "KE/LENDER/0010", name: "Alygath Microenterprises", status: "SUSPENDED", entityId: 10, borrowers: 381, loans: 1325, daysSinceContribution: 613 },
];

const E = "ecosystem.exposure";

const SERVICES = [
  { code: "exposure-v1", name: "Ecosystem Exposure", kind: "QUERY" as const, reportType: 20, live: false,
    description: "Live multi-lender exposure and stacking velocity. The launch product.",
    requiredScopes: [E] },
  { code: "report-1", name: "Identity Verification", kind: "REPORT" as const, reportType: 1, live: false,
    description: "KYC status, liveness result, name and ID match confidence.",
    requiredScopes: ["kyc.verify"] },
  { code: "report-2", name: "Delinquency Status", kind: "REPORT" as const, reportType: 2, live: false,
    description: "Worst arrears bucket across the ecosystem, days past due.",
    requiredScopes: [E] },
  { code: "report-3", name: "Interchange Score", kind: "REPORT" as const, reportType: 3, live: false,
    description: "0–1000 network score with SHAP reason codes.",
    requiredScopes: [E, "mpesa.crunch", "model.train"] },
  { code: "report-11", name: "Cashflow & Affordability", kind: "REPORT" as const, reportType: 11, live: false,
    description: "M-Pesa derived income, volatility, obligations, disposable estimate.",
    requiredScopes: ["mpesa.crunch"] },
  { code: "report-12", name: "Full Enhanced", kind: "REPORT" as const, reportType: 12, live: false,
    description: "Every available evidence block, assembled.",
    requiredScopes: [E, "mpesa.crunch", "kyc.verify", "bureau.pull"] },
  { code: "report-21", name: "Intent Signal", kind: "REPORT" as const, reportType: 21, live: false,
    description: "Applications across members in the last 30 days, approved and declined.",
    requiredScopes: [E] },
  { code: "report-22", name: "Contactability", kind: "REPORT" as const, reportType: 22, live: false,
    description: "Best contact hour, promise-to-pay propensity, alternate numbers seen elsewhere.",
    requiredScopes: ["collections.contact"] },
  { code: "report-23", name: "Cohort Benchmark", kind: "REPORT" as const, reportType: 23, live: false,
    description: "This borrower against their cohort across the ecosystem.",
    requiredScopes: [E, "model.train"] },
];

async function main() {
  const now = Date.now();

  for (const m of MEMBERS) {
    const contributedAt =
      m.daysSinceContribution === null || m.daysSinceContribution === undefined
        ? null
        : new Date(now - m.daysSinceContribution * 86_400_000);

    await prisma.member.upsert({
      where: { code: m.code },
      update: {
        name: m.name,
        status: m.status,
        borrowers: m.borrowers,
        loans: m.loans,
        lastContributionAt: contributedAt,
      },
      create: {
        code: m.code,
        name: m.name,
        status: m.status,
        sourceHost: m.host ?? SHARED_198.host,
        sourceDatabase: m.db ?? SHARED_198.db,
        sourceEntityId: m.entityId ?? null,
        borrowers: m.borrowers,
        loans: m.loans,
        lastContributionAt: contributedAt,
        joinedAt: m.status === "ACTIVE" ? new Date(now - 30 * 86_400_000) : null,
        // The shadow period is not optional (blueprint v2 §7): contribute for
        // four weeks before query rights are granted.
        shadowUntil:
          m.status === "SHADOW" ? new Date(now + 21 * 86_400_000) : null,
      },
    });
  }

  for (const s of SERVICES) {
    await prisma.service.upsert({
      where: { code: s.code },
      update: { name: s.name, description: s.description, requiredScopes: s.requiredScopes, live: s.live },
      create: s,
    });
  }

  // Subscribe the two fully-active anchors to everything, so the Directory has
  // something real to render.
  const active = await prisma.member.findMany({ where: { status: "ACTIVE" } });
  const services = await prisma.service.findMany();
  for (const m of active) {
    for (const svc of services) {
      await prisma.subscription.upsert({
        where: { memberId_serviceId: { memberId: m.id, serviceId: svc.id } },
        update: {},
        create: {
          memberId: m.id,
          serviceId: svc.id,
          // Free tier indexed to contribution, per the commercial model.
          freeTierPerDay: Math.max(50, Math.floor(m.loans / 100)),
        },
      });
    }
  }

  const counts = {
    members: await prisma.member.count(),
    services: await prisma.service.count(),
    subscriptions: await prisma.subscription.count(),
  };
  console.log("seeded:", counts);
  console.log("mandatory scopes:", MANDATORY_SCOPES.join(", "));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
