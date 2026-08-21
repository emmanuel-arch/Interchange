// POST /api/consent/{ref}/revoke — a borrower withdraws.
//
// Revocation is PROSPECTIVE. It stops every future query immediately, and it
// does not delete the outcome labels already derived — those are retained under
// legitimate interest, because a lending decision that has already been made
// cannot be un-made and the record of it is what makes the decision auditable.
// Blueprint v2 §2.2. Say this plainly to borrowers; it is the part people
// misunderstand and the part a regulator will ask about.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, ctx: RouteContext<"/api/consent/[ref]/revoke">) {
  const { ref } = await ctx.params;

  const consent = await prisma.consent.findUnique({ where: { ref } });
  if (!consent) {
    return NextResponse.json({ error: "Unknown consent_ref." }, { status: 404 });
  }

  if (consent.revokedAt) {
    // Idempotent: revoking twice is not an error, it is the same outcome.
    return NextResponse.json({
      consent_ref: consent.ref,
      revoked_at: consent.revokedAt,
      already_revoked: true,
    });
  }

  let reason: string | null = null;
  try {
    const body = await request.json();
    reason = body?.reason ? String(body.reason) : null;
  } catch {
    // No body is fine — a borrower does not owe anyone a reason.
  }

  const updated = await prisma.consent.update({
    where: { ref },
    data: {
      revokedAt: new Date(),
      events: { create: { kind: "REVOKED", detail: reason } },
    },
  });

  return NextResponse.json({
    consent_ref: updated.ref,
    revoked_at: updated.revokedAt,
    // Members cache the Bloom filters and the policy set on a 15-minute cycle,
    // so tell the caller when this is guaranteed to be visible everywhere
    // rather than letting them assume it is instant.
    effective_ecosystem_wide_by: new Date(Date.now() + 15 * 60_000),
  });
}
