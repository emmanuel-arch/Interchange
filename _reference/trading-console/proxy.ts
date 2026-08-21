import { NextResponse, type NextRequest } from "next/server";
import { getCookieName, readSuiteSession } from "@/lib/suite-session";

/**
 * Auth gate for trading.birgenai.com (Next 16 "proxy" convention, formerly
 * middleware).
 *
 * Reads the shared BirgenAI suite session cookie (the same one birgenai.com /
 * movies.birgenai.com mint). Anyone without a valid session who tries to reach a
 * protected page is bounced to `/` — the screen-lock landing. Public surfaces:
 * `/` (the lock itself), the auth API routes, and static assets.
 *
 * Edge runtime: `readSuiteSession` only uses jose + @panva/hkdf, both edge-safe.
 */
function isPublic(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth")
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API routes guard themselves; never redirect them.
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(getCookieName())?.value;
  const session = await readSuiteSession(token);
  if (session) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|map)$).*)",
  ],
};
