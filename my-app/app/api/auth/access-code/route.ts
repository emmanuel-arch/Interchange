import { NextResponse, type NextRequest } from "next/server";
import {
  verifyAccessCode,
  getOwnerUser,
  ownerToClaims,
  checkRateLimit,
  recordFailedAttempt,
  clearAttempts,
} from "@/lib/owner";
import {
  mintSuiteSession,
  getCookieName,
  sessionCookieOptions,
} from "@/lib/suite-session";

// Needs Node APIs (Supabase service client, Buffer). Not edge.
export const runtime = "nodejs";

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);

  const rate = checkRateLimit(key);
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  let code = "";
  try {
    const body = await req.json();
    code = typeof body?.code === "string" ? body.code.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (!/^\d{4}$/.test(code)) {
    recordFailedAttempt(key);
    return NextResponse.json(
      { ok: false, error: "Enter the 4-digit access code." },
      { status: 400 },
    );
  }

  if (!verifyAccessCode(code)) {
    recordFailedAttempt(key);
    return NextResponse.json(
      { ok: false, error: "Invalid access code." },
      { status: 401 },
    );
  }

  // Code is valid — resolve the owner account in the shared users table.
  const owner = await getOwnerUser();
  if (!owner) {
    // Don't penalise the user's rate limit for a server/config problem.
    return NextResponse.json(
      { ok: false, error: "Access is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  const token = await mintSuiteSession(ownerToClaims(owner));
  clearAttempts(key);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(getCookieName(), token, sessionCookieOptions());
  return res;
}
