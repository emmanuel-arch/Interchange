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

export async function POST(request: Request) {
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
