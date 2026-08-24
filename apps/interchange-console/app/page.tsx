import MemberGate from "./member-gate";

// Server component. `searchParams` is async in Next 16 — see
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md.
//
// ?still=1 renders the gate settled, with no enter animations, so the whole
// screen is legible from the server HTML alone. Used for screenshots and
// visual review, and it is the graceful path when JS has not arrived yet.
//
// ?next=/exposure is set by proxy.ts when it turns someone away, so signing in
// returns them to the page they actually asked for. It is validated HERE rather
// than trusted in the client: an attacker-supplied `next` that left the origin
// would turn the sign-in screen into an open redirect, and one that pointed at
// an external host would do it while the browser was holding a fresh session
// cookie.
export default async function Page({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const still = sp.still === "1";

  const raw = typeof sp.next === "string" ? sp.next : "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/directory";

  return <MemberGate still={still} next={next} />;
}
