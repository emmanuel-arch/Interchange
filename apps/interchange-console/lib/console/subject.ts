// ─────────────────────────────────────────────────────────────────────────────
// THE CONSOLE'S CUSTOMER — who an operator is asking about, for whom, and what
// is already on record.
//
// An operator types a phone number or a national ID. Everything the search page
// shows hangs off three facts, resolved here on the server:
//
//   1. WHICH MEMBER is asking — the operator's own, from the session. A platform
//      operator, who belongs to no member, names one; nobody else can.
//   2. WHO the customer is — a national ID typed directly, or a phone number
//      looked up in THAT member's own book through the Lending Console node
//      (lib/console/resolve). Never another member's book.
//   3. WHAT IS ON RECORD — the member's live consent for this subject, and the
//      reports the member already holds for them.
//
// The national ID is the one identifier the bureau keys on, so it reaches this
// server as it does /api/v1/report. It is tokenised here, used, and dropped —
// never stored, never logged.
// ─────────────────────────────────────────────────────────────────────────────
import type { Member } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { identifierInput, normaliseNationalId } from "@/lib/oprf/node";
import { evaluateDirect } from "@/lib/oprf/registry";
import { can } from "@/lib/rights";
import type { ConsoleSession } from "@/lib/session";

export class ConsoleRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ConsoleRefusal";
  }
}

/** The member this session acts for. A platform operator must name one. */
export async function actingMember(session: ConsoleSession, requested?: string | null): Promise<Member> {
  const code = session.member ?? (requested?.trim().toUpperCase() || null);
  if (!session.member && requested && !can(session.rights, "registry:admin")) {
    throw new ConsoleRefusal("Only a platform administrator may act for another member.", 403);
  }
  if (!code) throw new ConsoleRefusal("Choose which member you are asking for.", 400);
  const member = await prisma.member.findUnique({ where: { code } });
  if (!member) throw new ConsoleRefusal(`No member ${code}.`, 404);
  return member;
}

/** Members a platform operator can act for — the ones with a published book. */
export async function actableMembers() {
  return prisma.member.findMany({
    where: { status: "ACTIVE", holdingGeneration: { gt: 0 } },
    select: { code: true, name: true },
    orderBy: { code: "asc" },
  });
}

/**
 * Phone or ID? A Kenyan mobile is 07…/01… (10 digits), 2547…/2541… (12), or the
 * same nine digits without the 0. A national ID is 6–8 digits in practice, so a
 * nine-digit number starting 7 or 1 is read as a phone.
 */
export function classify(raw: string): { kind: "phone"; msisdn: string } | { kind: "id"; id: string } | null {
  const digits = raw.replace(/\D/g, "");
  const local =
    digits.length === 12 && digits.startsWith("254") ? digits.slice(3)
    : digits.length === 10 && digits.startsWith("0") ? digits.slice(1)
    : digits.length === 9 ? digits
    : null;
  if (local && /^[17]\d{8}$/.test(local)) return { kind: "phone", msisdn: `254${local}` };
  const id = normaliseNationalId(digits);
  return id ? { kind: "id", id } : null;
}

/** The ecosystem token for a national ID — the Registry's own key, as /api/v1/report derives it. */
export function tokenFor(nationalId: string): string {
  const clean = normaliseNationalId(nationalId);
  if (!clean) throw new ConsoleRefusal("That is not a usable national ID.", 400);
  const key = process.env.INTERCHANGE_OPRF_KEY;
  if (!key) throw new ConsoleRefusal("The token service is not configured on this deployment.", 503);
  return evaluateDirect(key, new TextEncoder().encode(identifierInput("national_id", clean)));
}

export type ConsentView = {
  ref: string;
  capturedAt: string;
  expiresAt: string;
  scopes: string[];
  basis: string | null;
  note: string | null;
  recordedBy: string | null;
  via: string;
};

/** The member's newest live consent for this subject that covers these scopes, or null. */
export async function liveConsent(memberId: string, subjectToken: string, scopes: string[] = ["bureau.pull"]): Promise<ConsentView | null> {
  const rows = await prisma.consent.findMany({
    where: { memberId, subjectToken, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { capturedAt: "desc" },
    take: 20,
  });
  const row = rows.find((r) => scopes.every((s) => r.scopes.includes(s)));
  if (!row) return null;
  const ev = (row.evidence ?? {}) as Record<string, unknown>;
  const by = (ev.attestedBy ?? {}) as Record<string, unknown>;
  return {
    ref: row.ref,
    capturedAt: row.capturedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    scopes: row.scopes,
    basis: typeof ev.basisLabel === "string" ? ev.basisLabel : typeof ev.surface === "string" ? `recorded in the ${ev.surface}` : null,
    note: typeof ev.note === "string" ? ev.note : null,
    recordedBy: typeof by.name === "string" ? by.name : null,
    via: row.capturedVia,
  };
}

/** The ways an operator may say the customer authorised the check — the Lending Console's list. */
export const CONSENT_BASES: Record<string, string> = {
  "loan-agreement": "In their signed loan agreement",
  "in-person": "In person, to me",
  "recorded-call": "On a recorded call",
};

/** The attestation the checkbox carries, word for word, kept with the consent. */
export const ATTESTATION =
  "I confirm this customer has authorised a credit reference check, and I am recording it under my name.";

/**
 * What an operator's attestation covers. A credit reference check, in the
 * network's terms, is three things: the bureau file (bureau.pull), the bureau's
 * identity check (kyc.verify), and the live ecosystem check — whether the
 * customer owes other members now (ecosystem.exposure). Nothing beyond that is
 * recorded on the strength of an officer's word.
 */
export const ATTESTED_SCOPES = ["bureau.pull", "kyc.verify", "ecosystem.exposure"];
