// GET /api/session/dev — local development console access.
//
// A browser cannot produce the Ed25519 signature /api/session requires, and the
// access-code door (/api/session/code) needs an Operator row to exist. This is
// the escape hatch for neither being true yet — opening the console as a member
// with no credential at all.
//
// FENCED THREE WAYS, because a route that hands out sessions is exactly the kind
// of convenience that escapes into production:
//   · refuses unless NODE_ENV !== "production"
//   · refuses unless INTERCHANGE_DEV_OPEN_CONSOLE=1 is explicitly set
//   · only ever issues a session for a member that already exists
//
// If you are reading this in a deployed environment, it should be returning 404.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { effectiveRights } from "@/lib/rights";
import { mintSession, SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const enabled =
    process.env.NODE_ENV !== "production" &&
    process.env.INTERCHANGE_DEV_OPEN_CONSOLE === "1";

  if (!enabled) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("member") ?? "KE/LENDER/3005";
  const next = url.searchParams.get("next") ?? "/directory";

  const member = await prisma.member.findUnique({ where: { code } });
  if (!member) {
    return NextResponse.json({ error: 'Unknown member "' + code + '".' }, { status: 404 });
  }

  // Only ever redirect within this app — an open redirect on a route that also
  // sets a session cookie would be a genuinely nasty combination.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/directory";
  const rights = effectiveRights("MEMBER_ADMIN", []);

  const response = NextResponse.redirect(new URL(target, url.origin));
  response.cookies.set({
    name: SESSION_COOKIE,
    value: mintSession({
      sub: member.code,
      kind: "member",
      name: member.name,
      role: "MEMBER_ADMIN",
      member: member.code,
      rights,
    }),
    ...sessionCookieOptions(),
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
