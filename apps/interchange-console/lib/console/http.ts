// The console's own API routes are reached from a signed-in browser, never from
// a node. Each one checks the session and the right it spends here, in the
// handler — proxy.ts guards pages, not /api.
import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE, type ConsoleSession } from "@/lib/session";
import { can, type Right } from "@/lib/rights";
import { ConsoleRefusal } from "./subject";

export function sessionOr401(request: NextRequest, right: Right): ConsoleSession | NextResponse {
  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "SIGNED_OUT", message: "Your session has ended. Sign in again." }, { status: 401 });
  if (!can(session.rights, right)) {
    return NextResponse.json({ error: "FORBIDDEN", message: `Your access does not include ${right}.` }, { status: 403 });
  }
  return session;
}

export async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const j = await request.json();
    return j && typeof j === "object" ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** A ConsoleRefusal becomes its own status and sentence; anything else is a real fault. */
export function refusalOr(e: unknown): NextResponse {
  if (e instanceof ConsoleRefusal) return NextResponse.json({ error: "REFUSED", message: e.message }, { status: e.status });
  throw e;
}
