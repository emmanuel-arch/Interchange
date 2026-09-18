// ─────────────────────────────────────────────────────────────────────────────
// Stand the Registry schema up on an EMPTY Postgres, without the Prisma CLI.
//
//   npx tsx scripts/registry-bootstrap.ts                    # check only — no writes
//   npx tsx scripts/registry-bootstrap.ts --apply            # create the schema
//   npx tsx scripts/registry-bootstrap.ts --grant <role>     # give the app role DML
//
// ── WHY NOT `prisma db push` ─────────────────────────────────────────────────
// Prisma's native CLI connector fails against the Supabase pooler with P1001
// ("Can't reach database server") while the SAME URL connects fine through the
// `pg` driver the app itself uses. So the DDL is generated OFFLINE —
//
//   prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
//
// — committed as prisma/registry-bootstrap/schema.sql, and applied here through
// `pg`. schema.prisma stays the source of truth; regenerate the file whenever it
// changes. The file is reviewable, which a push inferred at run time is not.
//
// ── WHICH CONNECTION ─────────────────────────────────────────────────────────
// REGISTRY_ADMIN_URL if set, else DIRECT_URL, else DATABASE_URL. DDL belongs on
// the SESSION pooler (5432) or a direct connection, never on the transaction
// pooler (6543), which cannot hold a multi-statement transaction open.
//
// If the app connects as a least-privilege role, run --apply as the OWNER
// (REGISTRY_ADMIN_URL) and then --grant that role. The owner is the only one who
// can create tables; the app role should never need to.
//
// ── IT REFUSES TO RUN OVER A REGISTRY ────────────────────────────────────────
// A Registry holds registered member keys and the consent ledger. --apply only
// runs when NONE of its tables exist, inside one transaction, so it either
// creates the whole schema or nothing. A partly-present schema is refused and
// named — that is an upgrade, and upgrades are the hand-written files in
// prisma/migrations-manual/.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";

const REGISTRY_TABLES = [
  "Member", "Service", "Subscription", "Consent", "ConsentEvent", "AuditEntry",
  "MessageLogEntry", "OprfIssuance", "MemberHolding", "MemberFilter", "LedgerEvent",
  "Decision", "ModelVersion", "ShadowScore", "MemberApplication", "GovernanceAction",
  "Operator", "OperatorAudit",
];

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : null;
};
const APPLY = process.argv.includes("--apply");
const GRANT = arg("grant");

function connectionString(): { url: string; source: string } {
  for (const name of ["REGISTRY_ADMIN_URL", "DIRECT_URL", "DATABASE_URL"]) {
    const v = process.env[name]?.trim();
    if (v) return { url: v, source: name };
  }
  throw new Error("No connection string: set REGISTRY_ADMIN_URL, DIRECT_URL or DATABASE_URL.");
}

/** Same rule as lib/prisma.ts: TLS for every non-local host, whatever the URL says. */
function isLocal(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** Never print a password. User, host and port are enough to know which door this is. */
function describe(url: string): string {
  const u = new URL(url);
  return `${decodeURIComponent(u.username)}@${u.hostname}:${u.port || 5432}`;
}

async function existingTables(c: Client): Promise<string[]> {
  const r = await c.query<{ t: string }>(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [REGISTRY_TABLES],
  );
  return r.rows.map((x) => x.t).sort();
}

async function main() {
  const { url, source } = connectionString();
  const port = Number(new URL(url).port || 5432);
  console.log(`\nRegistry bootstrap → ${describe(url)} \x1b[2m(from ${source})\x1b[0m`);
  if ((APPLY || GRANT) && port === 6543) {
    throw new Error("Port 6543 is the transaction pooler. Run DDL on the session pooler (5432) or a direct connection.");
  }

  const c = new Client({
    connectionString: url,
    ssl: isLocal(url) ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });
  await c.connect();

  try {
    const who = await c.query<{ user: string; super: boolean; bypass: boolean; can_create: boolean; version: string }>(
      `SELECT current_user AS user, r.rolsuper AS super, r.rolbypassrls AS bypass,
              has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
              split_part(version(), ' ', 2) AS version
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const me = who.rows[0];
    console.log(
      `  role ${me.user} · postgres ${me.version} · create in public: ${me.can_create ? "yes" : "NO"}` +
        ` · superuser: ${me.super ? "yes" : "no"} · bypassrls: ${me.bypass ? "yes" : "no"}`,
    );

    const present = await existingTables(c);
    console.log(`  registry tables present: ${present.length}/${REGISTRY_TABLES.length}` +
      (present.length && present.length < REGISTRY_TABLES.length ? ` → ${present.join(", ")}` : ""));

    if (APPLY) {
      if (present.length === REGISTRY_TABLES.length) {
        console.log("  \x1b[32m✓ already bootstrapped — nothing to do\x1b[0m");
      } else if (present.length > 0) {
        throw new Error(
          `Refusing: ${present.length} Registry tables already exist. This is an upgrade, not a bootstrap — ` +
            "apply the files in prisma/migrations-manual/ instead.",
        );
      } else if (!me.can_create) {
        throw new Error(`Role ${me.user} cannot CREATE in schema public. Run --apply as the owner (REGISTRY_ADMIN_URL).`);
      } else {
        const sql = readFileSync(join(__dirname, "..", "prisma", "registry-bootstrap", "schema.sql"), "utf8");
        const t = Date.now();
        await c.query("BEGIN");
        try {
          await c.query(sql);
          await c.query("COMMIT");
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        }
        const after = await existingTables(c);
        if (after.length !== REGISTRY_TABLES.length) {
          throw new Error(`Applied, but only ${after.length}/${REGISTRY_TABLES.length} tables are visible afterwards.`);
        }
        console.log(`  \x1b[32m✓ schema created — ${after.length} tables in ${Date.now() - t}ms\x1b[0m`);
      }
    }

    if (GRANT !== null) {
      if (!/^[a-z_][a-z0-9_]*$/.test(GRANT)) throw new Error(`"${GRANT}" is not a plain role name.`);
      const role = await c.query(`SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = $1`, [GRANT]);
      if (!role.rowCount) throw new Error(`Role "${GRANT}" does not exist.`);
      // The role name has been validated as a bare identifier above; it is quoted
      // anyway so a reserved word cannot change the statement's meaning.
      const r = `"${GRANT}"`;
      await c.query("BEGIN");
      try {
        await c.query(`GRANT USAGE ON SCHEMA public TO ${r}`);
        await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r}`);
        await c.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r}`);
        // Tables this owner creates later (the next manual migration) inherit the
        // same rights, so an upgrade cannot silently lock the app out.
        await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${r}`);
        await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${r}`);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
      console.log(`  \x1b[32m✓ ${GRANT} granted DML on the Registry\x1b[0m` +
        (role.rows[0].rolbypassrls ? "  \x1b[33m(note: this role has BYPASSRLS)\x1b[0m" : ""));
    }

    if (!APPLY && GRANT === null) {
      console.log("\n  Check only. Re-run with --apply to create the schema, --grant <role> to give the app role DML.");
    }
    console.log("");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(`\n\x1b[31m✗ ${e instanceof Error ? e.message : String(e)}\x1b[0m\n`);
  process.exit(1);
});
