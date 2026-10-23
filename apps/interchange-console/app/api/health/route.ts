// GET /api/health — is this Registry up, which release is it, and can it reach
// its database?
//
// bridge/interchange-node/deploy.ps1 switches a release live only when this
// answers 200 with `release` equal to the folder it just unpacked, so a build
// that starts but cannot talk to Postgres is rolled back instead of left serving
// 500s. INTERCHANGE_RELEASE is set by launch.cjs; elsewhere (Vercel, a laptop)
// it is null and the route still answers.
//
// Public and unauthenticated on purpose — it says nothing a stranger can use:
// no host, no version, no error text, only whether the database answered.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const t = Date.now();
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch (e) {
    console.error("[health] database:", e);
  }
  return NextResponse.json(
    { ok: db, db, dbMs: db ? Date.now() - t : null, release: process.env.INTERCHANGE_RELEASE ?? null },
    { status: db ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
