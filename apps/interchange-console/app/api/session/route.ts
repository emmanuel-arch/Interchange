// POST /api/session — establish a console session as a MEMBER's node.
// DELETE /api/session — sign out.
//
// Authenticated the same way member-to-member calls are: an Ed25519 signature
// over the canonical request string. The operator's node signs on their behalf,
// which is how an X-Road-style console works in practice — you are on the
// member's network, holding the member's key.
//
// A browser cannot sign this on its own. That is not a limitation any more, it
// is a separation: /api/session/code is the HUMAN door (an operator and a
// four-digit code, lib/operator.ts) and this is the MACHINE door. Both mint the
// same signed session token, so everything downstream — proxy.ts, the console
// layout, the rights checks — is identical whichever way you came in.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRequest } from "@/lib/signing";
import { effectiveRights } from "@/lib/rights";
import { mintSession, SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  const memberCode = request.headers.get("x-interchange-member") ?? "";
  const member = memberCode
    ? await prisma.member.findUnique({ where: { code: memberCode } })
    : null;

  const verified = verifyRequest({
    method: "POST",
    path: "/api/session",
    body: raw,
    headers: request.headers,
    publicKeyHex: member?.publicKey ?? null,
  });

  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.failure, message: verified.message },
      { status: 401 },
    );
  }

  if (member!.status === "SUSPENDED") {
    return NextResponse.json(
      { error: "MEMBER_SUSPENDED", message: "Suspended members cannot open a console session." },
      { status: 403 },
    );
  }

  // A node-signed session acts for that member and holds the member-administrator
  // set. It never holds the wildcard: the platform rights (operator management,
  // OPRF rotation, governance decisions) belong to BirgenAI, and a member holding
  // its own node key must not be able to reach them.
  const rights = effectiveRights("MEMBER_ADMIN", []);

  const response = NextResponse.json({ member: member!.code, name: member!.name, rights });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: mintSession({
      sub: member!.code,
      kind: "member",
      name: member!.name,
      role: "MEMBER_ADMIN",
      member: member!.code,
      rights,
    }),
    ...sessionCookieOptions(),
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: SESSION_COOKIE, value: "", ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
