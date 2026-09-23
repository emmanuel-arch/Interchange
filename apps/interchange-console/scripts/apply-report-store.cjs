// Apply the report-store migration through the pg driver.
//
// Not `prisma db push`: its native CLI connector fails with P1001 against the
// Supabase pooler on this box while the same URL connects fine through pg, and
// the app's own client uses the pg adapter anyway. See the toolchain note.
require("dotenv/config");
const fs = require("fs");
const { Client } = require("pg");

const FILE = "prisma/migrations-manual/2026-09-24-report-store.sql";
const TABLES = [
  "ReportPull", "ReportCreditFile", "ReportCreditLine",
  "ReportCashflow", "ReportCashflowMonth", "ReportIdentity", "ReportExposure",
];

async function present(c) {
  const { rows } = await c.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [TABLES],
  );
  return rows.map((r) => r.table_name);
}

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("No DIRECT_URL / DATABASE_URL in scope.");
  const host = new URL(url).host;
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    console.log("registry   :", host);
    const before = await present(c);
    console.log("before     :", before.length ? before.join(", ") : "(none of the report-store tables exist)");

    await c.query(fs.readFileSync(FILE, "utf8"));

    const after = await present(c);
    console.log("after      :", after.join(", "));
    console.log("created    :", after.filter((t) => !before.includes(t)).join(", ") || "(nothing new — already applied)");

    // Prove the shape, not just the names: the columns the store writes.
    const { rows: cols } = await c.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='ReportCashflow'
          AND column_name IN ('incomeVolatility','gamblingRatio','avgMonthlyIncome','loanDependencyRatio','score')
        ORDER BY column_name`,
    );
    console.log("cashflow   :", cols.map((r) => `${r.column_name}:${r.data_type}`).join(", "));

    const { rows: enums } = await c.query(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'PullSource' ORDER BY e.enumsortorder`,
    );
    console.log("PullSource :", enums.map((r) => r.enumlabel).join(", "));
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
