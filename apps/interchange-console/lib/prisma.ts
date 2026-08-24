// Prisma client singleton (Prisma 7: the driver adapter carries the connection).
//
// Sprint 2 will wrap this the way BirgenAI_LMS does — a Postgres RLS policy set
// plus a per-transaction member stamp, so a query that forgets its member scope
// returns nothing rather than everything. Until that lands, scoping is
// app-level only: treat every query in this app as security-relevant, and never
// take a member id from a request body.
//
// ── WHY THE CLIENT IS BUILT LAZILY ───────────────────────────────────────────
// This module used to construct the client at import time:
//
//     export const prisma = globalForPrisma.prisma ?? createClient();
//
// which reads well and breaks `next build`. Next's "Collecting page data" step
// IMPORTS every route module to read its configuration exports — `runtime`,
// `dynamic`, `revalidate`. Importing a route imports this file, this file threw
// on a missing DATABASE_URL, and the build died on the first API route with:
//
//     Failed to collect configuration for /api/authorise
//       [cause]: Error: [prisma] DATABASE_URL is not set.
//
// The throw is worth keeping — "DATABASE_URL is not set" is a better ninety
// seconds than a node-postgres parse error on an empty connection string, and
// it is exactly the kind of misconfiguration that otherwise surfaces as a
// mystery 500 in production. What was wrong was WHEN it fired.
//
// So construction is deferred to first use. Importing this module now costs
// nothing and cannot fail; the first actual query is what needs a database, and
// that is the moment the error is useful. A build no longer depends on a secret
// being present, which is the property that matters: build-time and run-time
// environments are not the same environment, and a build that only succeeds
// when production credentials happen to be in scope is a build that will fail
// on somebody's laptop, in CI, and in a preview deployment.
//
// The Proxy is the whole mechanism. It forwards every property access to the
// real client, creating it on the first one, and binds methods so `this` is the
// client rather than the proxy — which `$transaction` and the `$executeRaw`
// template tag both require.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("[prisma] DATABASE_URL is not set.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * The real client, made on demand.
 *
 * Cached on `globalThis` outside production for the usual reason: `next dev`
 * re-evaluates modules on every edit, and a fresh PrismaClient per edit
 * exhausts the connection pool within a few dozen saves.
 */
function client(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const created = createClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = created;
  return created;
}

// In production the proxy holds its own reference, so the client is built once
// per lambda rather than once per property access.
let cached: PrismaClient | undefined;

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    cached ??= client();
    // `Reflect.get` with the client as receiver so accessor properties resolve
    // against it, not against the empty proxy target.
    const value = Reflect.get(cached, property, cached);
    return typeof value === "function" ? value.bind(cached) : value;
  },
  // `has` and `getOwnPropertyDescriptor` keep `in` checks and introspection
  // honest — Prisma's own internals probe the client this way.
  has(_target, property) {
    cached ??= client();
    return property in cached;
  },
  getOwnPropertyDescriptor(_target, property) {
    cached ??= client();
    const d = Reflect.getOwnPropertyDescriptor(cached, property);
    // A descriptor must be reported configurable or the Proxy invariant check
    // throws, because the target ({}) has no such property to match against.
    return d ? { ...d, configurable: true } : undefined;
  },
  ownKeys() {
    cached ??= client();
    return Reflect.ownKeys(cached);
  },
});
