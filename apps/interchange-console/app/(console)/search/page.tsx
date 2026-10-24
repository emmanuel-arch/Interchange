// /search — Customer search: find a customer, record their consent, pull a
// bureau report or check live exposure, from the Interchange itself. The flow
// and its rules live in components/console/CustomerSearch and the four
// /api/console routes; this page only says who is asking.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/chrome";
import CustomerSearch from "@/components/console/CustomerSearch";
import { actableMembers } from "@/lib/console/subject";
import { can } from "@/lib/rights";
import { readSession, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customer search" };

export default async function SearchPage() {
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const members = session && !session.member ? await actableMembers() : null;

  return (
    <>
      <PageHeader
        eyebrow="Bureau · through the Interchange"
        title="Customer Search"
        lede="Search a customer by phone number or national ID. Consent first; then every bureau report this lender can pull, with what it costs before anything is billed."
      />
      <CustomerSearch
        mode="bureau"
        members={members}
        canPull={can(session?.rights, "reports:run")}
        canCapture={can(session?.rights, "consent:capture")}
      />
    </>
  );
}
