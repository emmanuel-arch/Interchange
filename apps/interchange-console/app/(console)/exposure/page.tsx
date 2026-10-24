// ─────────────────────────────────────────────────────────────────────────────
// /exposure — Ecosystem Exposure, live, in production.
//
// This page used to say "This surface runs only in development": it worked by
// impersonating Micromart's node, reading a member's private key from a file and
// deriving tokens with the ecosystem key directly — neither of which a
// production console may do. It now asks as the OPERATOR'S OWN MEMBER, proved
// by their session, through the consent gate, with each member's answer read
// from the holdings this Registry already serves (lib/exposure/local). The
// screen is the Customer search, opened on the exposure question.
// ─────────────────────────────────────────────────────────────────────────────
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/chrome";
import CustomerSearch from "@/components/console/CustomerSearch";
import { actableMembers } from "@/lib/console/subject";
import { can } from "@/lib/rights";
import { readSession, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live exposure" };

export default async function ExposurePage() {
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const members = session && !session.member ? await actableMembers() : null;

  return (
    <>
      <PageHeader
        eyebrow="Plane A · exposure-v1"
        title="Ecosystem Exposure"
        lede="Ask every member whether this borrower owes them money right now. Screened against published Bloom filters first, so members who could not possibly hold them are never contacted — and never learn the query happened."
      />
      <CustomerSearch
        mode="exposure"
        members={members}
        canPull={can(session?.rights, "reports:run")}
        canCapture={can(session?.rights, "consent:capture")}
      />
    </>
  );
}
