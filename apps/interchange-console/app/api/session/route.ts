// POST /api/session — establish a console session.
//
// Authenticated the same way member-to-member calls are: an Ed25519 signature
// over the canonical request string. The operator's node signs on their behalf,
// which is how an X-Road-style console works in practice — you are on the
// member's network, holding the member's key.
//
// A browser cannot sign this on its own, and that is the honest limitation:
// a human-facing operator login (WebAuthn, or per-operator credentials issued by
// the member) is a separate piece of work. See /api/session/dev for the local
// development path, which is fenced off from production.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRequest } from "@/lib/signing";
import { SESSION_COOKIE } from "@/proxy";

const SESSION_TTL_SECONDS = 60 * 60 * 8;

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

  const response = NextResponse.json({ member: member!.code, name: member!.name });
  response.cookies.set(SESSION_COOKIE, member!.code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
