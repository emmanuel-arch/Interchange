// GET /api/session/dev — local development console access.
//
// A browser cannot produce the Ed25519 signature /api/session requires, so
// without this there is no way to look at the console during development.
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
import { SESSION_COOKIE } from "@/proxy";

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
    return NextResponse.json({ error: `Unknown member "${code}".` }, { status: 404 });
  }

  // Only ever redirect within this app — an open redirect on a route that also
  // sets a session cookie would be a genuinely nasty combination.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/directory";

  const response = NextResponse.redirect(new URL(target, url.origin));
  response.cookies.set(SESSION_COOKIE, member.code, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
