// ─────────────────────────────────────────────────────────────────────────────
// PROVE THE CONSOLE DOOR.
//
//   npm run dev            (in another terminal)
//   npm run verify:operator
//
// Outside-in on purpose. The unit-level question ("does verifyCode return true")
// is not the one that matters; the one that matters is whether a person holding
// the code gets into /directory and a person holding a forged cookie does not.
// Only real HTTP against the running app can answer that, because the answer
// depends on proxy.ts, the cookie attributes and the signature all agreeing.
//
// STATE IS RESTORED. A wrong-code test charges a failed attempt against every
// active operator (by design — see chargeFailedAttempt), so this script clears
// the counters in a finally block. A verification run that left the founder
// locked out of his own console would be worse than no verification at all.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { mintSession } from "../lib/session";
import { expandForDisplay, ALL_RIGHTS } from "../lib/rights";

const BASE = process.env.INTERCHANGE_SELF_URL || "http://127.0.0.1:3341";
const CODE = process.env.VERIFY_OPERATOR_CODE || "5564";

const G = (s: string) => "\x1b[32m" + s + "\x1b[0m";
const R = (s: string) => "\x1b[31m" + s + "\x1b[0m";
const D = (s: string) => "\x1b[2m" + s + "\x1b[0m";
const B = (s: string) => "\x1b[1m" + s + "\x1b[0m";

let failed = 0;
const check = (ok: boolean, label: string, detail?: string) => {
  if (!ok) failed++;
  console.log("  " + (ok ? G("✓") : R("✗")) + " " + label + (detail ? "\n     " + D(detail) : ""));
};

/** The session cookie value from a Set-Cookie header, or null. */
function sessionCookie(res: Response): string | null {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const m = /^interchange_session=([^;]*)/.exec(c);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function main() {
  console.log(B("\n  The Interchange — console door\n"));
  console.log(D("  " + BASE + "\n"));

  // ── 0. The operator exists and actually holds everything ──────────────────
  const supers = await prisma.operator.findMany({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
  check(supers.length > 0, "a SUPER_ADMIN operator exists", supers.map((s) => s.name).join(", "));
  if (supers.length) {
    const rights = expandForDisplay(supers[0]!.rights);
    check(
      rights.length === ALL_RIGHTS.length,
      "super admin holds every right (" + rights.length + "/" + ALL_RIGHTS.length + ")",
    );
  }

  // ── 1. The right code opens the door ──────────────────────────────────────
  const good = await fetch(BASE + "/api/session/code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: CODE }),
    redirect: "manual",
  });
  const cookie = sessionCookie(good);
  const body = (await good.json().catch(() => ({}))) as Record<string, unknown>;
  check(good.status === 200, "correct code is accepted", "HTTP " + good.status);
  check(!!cookie, "a session cookie is issued");
  const op = body.operator as Record<string, unknown> | undefined;
  check(Array.isArray(op?.rights) && (op!.rights as string[]).includes("*"), "the session carries the wildcard right");
  check(op?.member === null, "the platform operator is not scoped to one member");

  // ── 2. That cookie actually opens a gated page ────────────────────────────
  if (cookie) {
    const page = await fetch(BASE + "/directory", {
      headers: { cookie: "interchange_session=" + cookie },
      redirect: "manual",
    });
    check(page.status === 200, "/directory opens with the session", "HTTP " + page.status);
  }

  // ── 3. No cookie is turned away, and told where to come back to ───────────
  const anon = await fetch(BASE + "/directory", { redirect: "manual" });
  const location = anon.headers.get("location") ?? "";
  check(anon.status >= 300 && anon.status < 400, "/directory redirects when signed out", "HTTP " + anon.status);
  check(location.includes("next=%2Fdirectory") || location.includes("next=/directory"), "the redirect remembers where you were going", location);

  // ── 4. THE ONE THAT MATTERS: a hand-written cookie is refused ─────────────
  //
  // This is the hole Sprint 1 shipped. The old proxy checked only that the
  // cookie existed, so typing a member code into document.cookie was a valid
  // session as the largest lender in the cohort.
  const forged = await fetch(BASE + "/directory", {
    headers: { cookie: "interchange_session=KE/LENDER/3005" },
    redirect: "manual",
  });
  check(forged.status >= 300 && forged.status < 400, "a forged cookie is refused", "HTTP " + forged.status);

  // ── 5. A token signed with the wrong key is refused ───────────────────────
  const realSecret = process.env.INTERCHANGE_SESSION_SECRET;
  process.env.INTERCHANGE_SESSION_SECRET = "an-attacker-key-that-is-long-enough-to-pass";
  const badToken = mintSession({ sub: "x", kind: "operator", name: "Mallory", role: "SUPER_ADMIN", member: null, rights: ["*"] });
  process.env.INTERCHANGE_SESSION_SECRET = realSecret;
  const wrongKey = await fetch(BASE + "/directory", {
    headers: { cookie: "interchange_session=" + badToken },
    redirect: "manual",
  });
  check(wrongKey.status >= 300 && wrongKey.status < 400, "a token signed with another key is refused", "HTTP " + wrongKey.status);

  // ── 6. A wrong code is refused, and says nothing useful ───────────────────
  const wrong = await fetch(BASE + "/api/session/code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "0000" }),
    redirect: "manual",
  });
  const wrongBody = (await wrong.json().catch(() => ({}))) as Record<string, unknown>;
  check(wrong.status === 401 || wrong.status === 429, "a wrong code is refused", "HTTP " + wrong.status);
  check(!sessionCookie(wrong), "no cookie is issued on refusal");
  check(
    typeof wrongBody.message === "string" && !/operator|exists|member/i.test(wrongBody.message),
    "the refusal does not leak whether an operator matched",
    String(wrongBody.message),
  );

  // ── 7. A malformed code never reaches the hashing path ────────────────────
  const malformed = await fetch(BASE + "/api/session/code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "not-a-pin" }),
    redirect: "manual",
  });
  check(malformed.status === 401, "a malformed code is refused", "HTTP " + malformed.status);

  console.log(
    "\n  " + (failed === 0 ? G("all checks passed") : R(failed + " check(s) failed")) + "\n",
  );
}

main()
  .catch((e) => {
    console.error(R("\n✗ " + (e instanceof Error ? e.message : String(e))));
    console.error(D("  Is the console running? npm run dev\n"));
    failed++;
  })
  .finally(async () => {
    // Undo the lockout pressure this run created.
    await prisma.operator
      .updateMany({ where: { status: "ACTIVE" }, data: { failedAttempts: 0, lockedUntil: null } })
      .catch(() => {});
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });
