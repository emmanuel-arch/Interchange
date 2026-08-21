// Prisma 7 config — the connection URL lives here, not in schema.prisma.
//
// Local development runs a real Postgres via `npx prisma dev` (PGlite), so the
// dialect matches production from day one and the RLS work planned for Sprint 2
// can be developed locally rather than only against Supabase.
//
// Resolve tolerantly: `prisma generate` runs in CI/Vercel postinstall and never
// connects, so the URL only has to parse. A strict env() throws and fails the
// whole install when DIRECT_URL is absent from a build environment.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL ||
      "postgresql://unused:unused@localhost:5432/unused",
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
