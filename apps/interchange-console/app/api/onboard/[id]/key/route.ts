// POST /api/onboard/{id}/key — register a public key by proving you hold it.
//
// The request must be signed with the key being registered. That is the whole
// point: without proof of possession, anyone could attach a key they do not
// hold to somebody else's application, and every signature that key later
// produced would be attributed to the wrong organisation.
//
// The applicant generates the pair inside their own infrastructure and sends
// only the public half. If a private key ever arrives here it is a bug in their
// integration, not a convenience — and the endpoint says so rather than
// silently accepting it.
import { NextResponse } from "next/server";
import { registerKey } from "@/lib/onboarding";

export async function POST(request: Request, ctx: RouteContext<"/api/onboard/[id]/key">) {
  const { id } = await ctx.params;
  const raw = await request.text();

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const publicKey = String(body.public_key ?? "").trim().toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(publicKey)) {
    return NextResponse.json(
      { error: "public_key must be a 64-character hex Ed25519 public key." },
      { status: 400 },
    );
  }
  if ("private_key" in body || "secret_key" in body) {
    return NextResponse.json(
      {
        error: "PRIVATE_KEY_SENT",
        message:
          "Your request contained a private key. Remove it, rotate that keypair, and send only the public half — the Interchange never holds a member's private key.",
      },
      { status: 400 },
    );
  }

  const result = await registerKey(id, publicKey, {
    method: "POST",
    path: `/api/onboard/${id}/key`,
    body: raw,
    headers: request.headers,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "KEY_PROOF_FAILED", message: result.reason }, { status: 401 });
  }

  return NextResponse.json({
    application_id: id,
    status: "KEY_REGISTERED",
    next_step:
      "Your application is with the governing body. On admission you enter a 28-day shadow period: " +
      "you contribute, and you may not yet query.",
  });
}
