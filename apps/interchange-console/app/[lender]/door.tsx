import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import StaffDoor from "@/components/door/StaffDoor";
import { lenderDoor } from "@/lib/lenders";
import { readSession, SESSION_COOKIE } from "@/lib/session";

// One lender's door — served at both /<lender> and /<lender>/signin, because the
// launcher links to the first and a person typing the address from memory tries
// the second. lib/lenders.ts says what a door is, and what it is not.
//
// Someone who already holds a session for this lender (or a platform operator,
// who belongs to every door) goes straight through to `next` rather than being
// shown a door they have already passed — the launcher is how staff come back
// in, so a second visit inside the eight hours is the common case. A session for
// a DIFFERENT lender still sees the door, which is how one shared PC changes hands.
export async function LenderDoorPage({
  lender,
  searchParams,
}: {
  lender: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const door = lenderDoor(lender);
  if (!door) notFound();

  // Validated here, as /signin does: an off-origin `next` on the screen that sets
  // the session cookie would be an open redirect holding a fresh credential.
  const raw = typeof searchParams.next === "string" ? searchParams.next : "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/search";

  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session && searchParams.still !== "1" && (!session.member || door.members.includes(session.member))) redirect(next);

  return (
    <StaffDoor
      next={next}
      lender={{
        slug: door.slug,
        name: door.name,
        logo: door.logo,
        mark: door.mark,
        accent: door.accent,
        glow: door.glow,
        line: door.line,
        emailDomain: door.emailDomain,
        photo: door.photo,
      }}
    />
  );
}
