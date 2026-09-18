// ─────────────────────────────────────────────────────────────────────────────
// GET/PUT /api/policy — a member's crunch settings.
//
// ── WHO MAY CHANGE WHAT ──────────────────────────────────────────────────────
// A member admin edits THEIR OWN member's policy and nobody else's. The member
// code is taken from the SESSION, never from the request body: a field a client
// controls is a field a client can change, and "which member's credit policy am
// I editing" is not a question the browser gets to answer. Only a platform
// operator holding `registry:admin` may name a different member, and only then.
//
// ── WHY A CHANGE IS RECORDED ─────────────────────────────────────────────────
// These settings move the instalment ceiling on every report the member
// produces. Six months from now somebody will ask why a particular application
// was declined, and the answer has to include who last moved the debt-service
// cap and when. `updatedBy` comes from the session for the same reason the
// member code does.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession } from "@/lib/session";
import { can } from "@/lib/rights";
import { getPolicy, savePolicy } from "@/lib/statement/policy-store";
import { DEFAULT_POLICY, policyDiff } from "@/lib/statement/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function session() {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}

/** Which member this request may act for, or a refusal. */
function scope(s: NonNullable<Awaited<ReturnType<typeof session>>>, asked: string | null): { member: string } | { error: string; status: number } {
  const own = s.member;
  if (!asked || asked === own) {
    if (!own) return { error: "This session is not scoped to a member. Name one with ?member=, which requires registry:admin.", status: 400 };
    return { member: own };
  }
  if (!can(s.rights, "registry:admin")) {
    return { error: "Only a platform operator may read or change another member's policy.", status: 403 };
  }
  return { member: asked };
}

export async function GET(request: Request) {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(s.rights, "policy:read")) return NextResponse.json({ error: "policy:read is required." }, { status: 403 });

  const asked = new URL(request.url).searchParams.get("member");
  const sc = scope(s, asked);
  if ("error" in sc) return NextResponse.json({ error: sc.error }, { status: sc.status });

  const resolved = await getPolicy(sc.member);
  return NextResponse.json({
    member: sc.member,
    source: resolved.source,
    problem: resolved.problem ?? null,
    policy: resolved.policy,
    default: DEFAULT_POLICY,
    diff: policyDiff(resolved.policy),
    canWrite: can(s.rights, "policy:write"),
  });
}

export async function PUT(request: Request) {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(s.rights, "policy:write")) return NextResponse.json({ error: "policy:write is required." }, { status: 403 });

  const asked = new URL(request.url).searchParams.get("member");
  const sc = scope(s, asked);
  if ("error" in sc) return NextResponse.json({ error: sc.error }, { status: sc.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body was not JSON." }, { status: 400 });
  }

  const result = await savePolicy(sc.member, body, `${s.name} (${s.role})`);
  return NextResponse.json(
    {
      member: sc.member,
      saved: result.saved,
      problem: result.problem ?? null,
      // Every clamp is reported rather than applied quietly: a member who typed
      // 6 meaning 60% needs to be told it was saved as 0.9, not left believing
      // their cap is six hundred percent.
      adjusted: result.adjusted,
      policy: result.policy,
      diff: policyDiff(result.policy),
    },
    { status: result.saved ? 200 : 503 },
  );
}
