import StaffDoor from "@/components/door/StaffDoor";

// The platform's door — no lender on the URL, so the Interchange's own colours.
// A lender's staff normally arrive at /<lender> from their launcher instead.
//
// ?next=/exposure is set by proxy.ts when it turns someone away, so signing in
// returns them to the page they asked for. It is validated HERE rather than
// trusted in the client: an off-origin `next` on the screen that sets the
// session cookie would be an open redirect holding a fresh credential.
export default async function Page({ searchParams }: PageProps<"/signin">) {
  const sp = await searchParams;
  const raw = typeof sp.next === "string" ? sp.next : "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/search";

  return <StaffDoor lender={null} next={next} />;
}
