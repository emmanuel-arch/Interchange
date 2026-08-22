// ─────────────────────────────────────────────────────────────────────────────
// proxy.ts — Next 16's replacement for middleware.ts.
//
// The filename and the exported function name both changed in 16, and the edge
// runtime is not supported here: proxy runs on Node and that is not
// configurable. See
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md.
//
// What this does: keeps the console behind a session. Sprint 1 shipped the
// vault gate with a stubbed auth that granted access to anyone, and the console
// routes were reachable directly by typing the URL — this closes that.
//
// What this deliberately does NOT do: authenticate the API. Member-to-member
// calls are authenticated per-message by Ed25519 signature in lib/signing.ts,
// which survives proxies and produces a storable artefact. A cookie could do
// neither, so /api/* is excluded here rather than half-protected by both.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE = "interchange_session";

/** Console routes. Everything else is either public or signature-authenticated. */
const PROTECTED = ["/directory", "/exposure", "/consent", "/audit", "/score", "/learning", "/log", "/governance"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session) return NextResponse.next();

  // Send them to the gate, remembering where they were going, so signing in
  // lands them on the page they asked for rather than dumping them at the root.
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/directory/:path*", "/exposure/:path*", "/consent/:path*", "/audit/:path*", "/score/:path*", "/learning/:path*", "/log/:path*", "/governance/:path*"],
};
