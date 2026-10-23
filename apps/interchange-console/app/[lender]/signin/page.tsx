import { LenderDoorPage } from "../door";

// interchange.…/axe/signin — the same door by the address people type.
export default async function Page({ params, searchParams }: PageProps<"/[lender]/signin">) {
  return <LenderDoorPage lender={(await params).lender} searchParams={await searchParams} />;
}
