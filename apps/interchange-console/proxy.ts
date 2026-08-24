// ─────────────────────────────────────────────────────────────────────────────
// proxy.ts — Next 16's replacement for middleware.ts.
//
// The filename and the exported function name both changed in 16, and the edge
// runtime is not supported here: proxy runs on Node and that is not
// configurable. See
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md.
//
// WHAT CHANGED IN SPRINT 2. This used to check that the session cookie merely
// EXISTED, which meant a visitor could type
// `document.cookie = "interchange_session=KE/LENDER/3005"` into a console and be
// inside as the largest lender in the cohort. httpOnly does not help: it stops a
// script reading the cookie, not a person writing one. The cookie is now an
// HMAC-signed token (lib/session.ts) and it is VERIFIED here, so a forged value
// is indistinguishable from no value at all.
//
// It also authorises rather than merely authenticating. Each console surface
// declares the right that admits it in lib/rights.ts, and someone who holds a
// session but not the right is sent to a surface they can actually open instead
// of onto a 403.
//
// What this deliberately does NOT do: authenticate the API. Member-to-member
// calls are authenticated per-message by Ed25519 signature in lib/signing.ts,
// which survives proxies and produces a storable artefact. A cookie could do
// neither, so /api/* is excluded here rather than half-protected by both.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/session";
import { can, rightForPath, ROUTE_RIGHTS } from "@/lib/rights";

export { SESSION_COOKIE };

/** Console routes. Everything else is either public or signature-authenticated. */
const PROTECTED = Object.keys(ROUTE_RIGHTS);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    // Send them to the gate, remembering where they were going, so signing in
    // lands them on the page they asked for rather than dumping them at the root.
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    // Clear a cookie that failed verification — expired, tampered, or minted
    // under a rotated secret. Leaving it in place means the browser re-presents
    // a dead credential on every navigation for the next eight hours.
    if (request.cookies.has(SESSION_COOKIE)) redirect.cookies.delete(SESSION_COOKIE);
    return redirect;
  }

  const required = rightForPath(pathname);
  if (required && !can(session.rights, required)) {
    // Signed in, but not for this. Land them on the first surface they DO hold,
    // rather than a dead end — an auditor should not have to guess that
    // /audit is the page their account was made for.
    const fallback = PROTECTED.find((p) => can(session.rights, ROUTE_RIGHTS[p]!));
    const url = request.nextUrl.clone();
    url.pathname = fallback ?? "/";
    url.searchParams.set("denied", required);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/directory/:path*",
    "/exposure/:path*",
    "/consent/:path*",
    "/audit/:path*",
    "/score/:path*",
    "/learning/:path*",
    "/log/:path*",
    "/governance/:path*",
  ],
};
