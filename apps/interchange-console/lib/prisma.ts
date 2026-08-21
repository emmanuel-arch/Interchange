// Prisma client singleton (Prisma 7: the driver adapter carries the connection).
//
// Sprint 2 will wrap this the way BirgenAI_LMS does — a Postgres RLS policy set
// plus a per-transaction member stamp, so a query that forgets its member scope
// returns nothing rather than everything. Until that lands, scoping is
// app-level only: treat every query in this app as security-relevant, and never
// take a member id from a request body.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("[prisma] DATABASE_URL is not set.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
