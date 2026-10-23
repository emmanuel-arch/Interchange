import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import MemberGate from "../member-gate";
import { lenderDoor } from "@/lib/lenders";
import { readSession, SESSION_COOKIE } from "@/lib/session";

// One lender's door — served at both /<lender> and /<lender>/signin, because the
// launcher links to the first and a person typing the address from memory tries
// the second. lib/lenders.ts says what a door is, and what it is not.
//
// Someone who already holds a session for this lender (or a platform operator,
// who belongs to every door) goes straight through to `next` rather than being
// shown a gate they have already passed — the launcher is how staff come back
// in, so a second visit inside the eight hours is the common case. A session for
// a DIFFERENT lender still sees the gate, which is how one shared PC changes hands.
export async function LenderDoorPage({
  lender,
  searchParams,
}: {
  lender: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const door = lenderDoor(lender);
  if (!door) notFound();

  const still = searchParams.still === "1";
  // Validated here, as /signin does: an off-origin `next` on the screen that sets
  // the session cookie would be an open redirect holding a fresh credential.
  const raw = typeof searchParams.next === "string" ? searchParams.next : "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/directory";

  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session && !still && (!session.member || door.members.includes(session.member))) redirect(next);

  return (
    <MemberGate
      still={still}
      next={next}
      lender={{ slug: door.slug, name: door.name, logo: door.logo, glow: door.glow, line: door.line, memberHint: door.memberHint }}
    />
  );
}
