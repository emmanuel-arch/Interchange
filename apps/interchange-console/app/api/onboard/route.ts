// POST /api/onboard — a lender applies to join.
//
// Public and unauthenticated, because an applicant has no identity in the
// ecosystem yet — that is what the application is for. Identity arrives at the
// next step, when they prove possession of a key by signing with it.
//
// Nothing here grants access. It creates a row a human has to decide on.
import { NextResponse } from "next/server";
import { apply } from "@/lib/onboarding";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const organisation = String(body.organisation ?? "").trim();
  const contactName = String(body.contact_name ?? "").trim();
  const contactEmail = String(body.contact_email ?? "").trim();

  if (!organisation || !contactName || !contactEmail) {
    return NextResponse.json(
      { error: "organisation, contact_name and contact_email are required." },
      { status: 400 },
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "contact_email is not a valid address." }, { status: 400 });
  }

  const application = await apply({
    organisation,
    contactName,
    contactEmail,
    sourceHost: body.source_host ? String(body.source_host) : undefined,
    sourceDatabase: body.source_database ? String(body.source_database) : undefined,
    sourceEntityId: body.source_entity_id ? Number(body.source_entity_id) : undefined,
    claimedBorrowers: body.claimed_borrowers ? Number(body.claimed_borrowers) : undefined,
    claimedLoans: body.claimed_loans ? Number(body.claimed_loans) : undefined,
  });

  return NextResponse.json(
    {
      application_id: application.id,
      status: application.status,
      next_step:
        "Generate an Ed25519 keypair inside your own infrastructure and register the PUBLIC half at " +
        `POST /api/onboard/${application.id}/key, signing that request with the private half. ` +
        "Never send us the private key — we do not want it and could not accept it.",
      shadow_period_days: 28,
    },
    { status: 201 },
  );
}
