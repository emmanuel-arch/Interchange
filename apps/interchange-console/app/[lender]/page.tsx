import { LenderDoorPage } from "./door";

// interchange.…/axe — the door the Lending Console and CallBox launchers open.
// `params` and `searchParams` are both async in Next 16.
export default async function Page({ params, searchParams }: PageProps<"/[lender]">) {
  return <LenderDoorPage lender={(await params).lender} searchParams={await searchParams} />;
}
