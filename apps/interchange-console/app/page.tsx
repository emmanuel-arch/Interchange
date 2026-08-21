import MemberGate from "./member-gate";

// Server component. `searchParams` is async in Next 16 — see
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md.
//
// ?still=1 renders the gate settled, with no enter animations, so the whole
// screen is legible from the server HTML alone. Used for screenshots and
// visual review, and it is the graceful path when JS has not arrived yet.
export default async function Page({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const still = sp.still === "1";

  return <MemberGate still={still} />;
}
