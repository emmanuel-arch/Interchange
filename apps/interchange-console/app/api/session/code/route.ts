// POST /api/session/code — operator sign-in with a four-digit access code.
//
// This is the human door. /api/session is the MACHINE door: an Ed25519 signature
// from a member's node, which a browser cannot produce and which therefore could
// never be what the vault gate's PIN pad talked to. Sprint 1 shipped that PIN pad
// with a setTimeout in place of authentication; this replaces it.
//
// The response deliberately says almost nothing. A caller learns "accepted" or
// "not accepted" and, when locked out, how long for — never whether a code
// matched an operator who was then refused, because that turns 10,000 guesses
// into a two-stage search.
import { NextResponse } from "next/server";
import { authenticateCode, chargeFailedAttempt, clientIp, sessionFor } from "@/lib/operator";
import { mintSession, SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// A DEPLOYMENT THAT IS NOT WIRED UP MUST SAY SO.
//
// Everything this route expects to go wrong already answers precisely: a bad
// code is 401, a lockout is 429, no operators is 503. What it did NOT handle was
// the environment being wrong — and that is the failure a new deployment
// actually hits.
//
// A DATABASE_URL carrying the wrong password threw P1000 out of
// authenticateCode(), unhandled, and the operator saw a bare 500 with the reason
// visible only in the platform's function logs. The first live sign-in attempt
// on a fresh deployment is exactly the wrong moment to make somebody go reading
// stack traces, and it is the moment this is most likely to happen.
//
// So misconfiguration is now its own answer: 503, naming WHICH thing is wrong,
// and nothing else. The distinction that matters is between "your code was
// wrong" (401 — tells the caller something true about their attempt) and "this
// server cannot check anybody's code right now" (503 — tells them nothing about
// their attempt, because nothing was checked).
//
// WHAT IS DELIBERATELY NOT IN THE RESPONSE: the connection string, the host, the
// username, the driver's own message. An unauthenticated caller learns that the
// server is misconfigured — which they can already infer from the 503 — and not
// one detail about the infrastructure behind it. The full error goes to the
// server log, where the operator can reach it and a stranger cannot.
type Misconfig = { message: string };

function misconfiguredAs(error: unknown): Misconfig | null {
  const code = (error as { code?: string })?.code;
  const text = error instanceof Error ? error.message : String(error);

  // Prisma's own initialisation codes. P1000 authentication, P1001 unreachable,
  // P1003 no such database, P1017 connection closed by the server.
  if (code === "P1000") return { message: "The database rejected this server's credentials." };
  if (code === "P1001" || code === "P1017") return { message: "The database is not reachable from this server." };
  if (code === "P1003") return { message: "The configured database does not exist." };

  // Thrown by lib/prisma.ts and lib/session.ts before anything is attempted.
  if (text.includes("DATABASE_URL is not set")) return { message: "This server has no database configured." };
  if (text.includes("INTERCHANGE_SESSION_SECRET")) return { message: "This server cannot sign sessions." };

  return null;
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    const misconfig = misconfiguredAs(error);
    if (!misconfig) throw error; // a real bug still surfaces as a real 500

    console.error("[session/code] misconfigured:", error);
    return NextResponse.json(
      {
        error: "MISCONFIGURED",
        message: `${misconfig.message} Sign-in is unavailable until an administrator corrects it — this is not a problem with your code.`,
      },
      { status: 503 },
    );
  }
}

async function handle(request: Request) {
  let body: { code?: string; next?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID", message: "Malformed request." }, { status: 400 });
  }

  const ip = clientIp(request.headers);
  const result = await authenticateCode(body.code ?? "", ip);

  if (!result.ok) {
    // Only a genuine miss costs an attempt. A throttle or a production refusal
    // must not deepen a lockout, or an attacker could lock every operator out of
    // their own console simply by hammering the door.
    if (result.reason === "INVALID") await chargeFailedAttempt(ip);

    const status =
      result.reason === "THROTTLED" || result.reason === "LOCKED"
        ? 429
        : result.reason === "DISABLED_IN_PRODUCTION"
          ? 403
          : result.reason === "MISCONFIGURED"
            ? 503
            : 401;

    return NextResponse.json(
      { error: result.reason, message: result.message, retryAfterMinutes: result.retryAfterMinutes },
      { status },
    );
  }

  const op = result.operator;
  const response = NextResponse.json({
    ok: true,
    operator: {
      name: op.name,
      role: op.role,
      member: op.memberCode,
      memberName: op.memberName,
      rights: op.rights,
    },
    // Only ever an in-app path — an open redirect on the route that also sets the
    // session cookie would be a genuinely nasty combination.
    next: typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//")
      ? body.next
      : "/directory",
  });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: mintSession(sessionFor(op)),
    ...sessionCookieOptions(),
    maxAge: SESSION_TTL_SECONDS,
  });

  return response;
}
