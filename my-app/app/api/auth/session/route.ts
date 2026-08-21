import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieName, readSuiteSession } from "@/lib/suite-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns the current BirgenAI suite session (who is signed in), or null. */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getCookieName())?.value;
  const session = await readSuiteSession(token);

  if (!session) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.sub,
      email: session.email ?? null,
      name: session.name ?? null,
      role: session.role ?? null,
      tier: session.tier ?? null,
      birgenAiId: session.birgenAiId ?? null,
    },
  });
}
