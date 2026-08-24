// ─────────────────────────────────────────────────────────────────────────────
// Operator administration.
//
//   npm run operator -- list
//   npm run operator -- create --name "Emmanuel Kiplet" --role SUPER_ADMIN --code 5564
//   npm run operator -- create --name "Desk Analyst" --role ANALYST --code 4821 --member KE/LENDER/3005
//   npm run operator -- recode --name "Emmanuel Kiplet" --code 7788
//   npm run operator -- disable --name "Desk Analyst"
//   npm run operator -- unlock  --name "Desk Analyst"
//
// `create` is IDEMPOTENT on (name, member): running it twice re-codes the same
// operator rather than producing a second one with the same name and a different
// PIN, which is the failure that makes a four-digit space ambiguous.
//
// THE CODE MUST BE UNIQUE ACROSS ALL OPERATORS. Sign-in scans operators and takes
// the first whose hash matches (lib/operator.ts), so two operators sharing 5564
// would mean whoever sorted first silently absorbed the other's sign-ins. This
// script refuses that rather than letting it happen quietly.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { hashCode, isWellFormedCode, validateGrant, verifyCode } from "../lib/operator";
import { effectiveRights, expandForDisplay, isRight, WILDCARD } from "../lib/rights";

const G = (s: string) => "\x1b[32m" + s + "\x1b[0m";
const R = (s: string) => "\x1b[31m" + s + "\x1b[0m";
const D = (s: string) => "\x1b[2m" + s + "\x1b[0m";
const B = (s: string) => "\x1b[1m" + s + "\x1b[0m";

const ROLES = ["SUPER_ADMIN", "MEMBER_ADMIN", "ANALYST", "AUDITOR"] as const;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf("--" + flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function die(message: string): never {
  console.error(R("✗ " + message));
  process.exit(1);
}

async function resolveMemberId(code: string | undefined): Promise<string | null> {
  if (!code) return null;
  const member = await prisma.member.findUnique({ where: { code }, select: { id: true } });
  if (!member) die('No member with code "' + code + '". Run `npm run db:seed` first.');
  return member.id;
}

/** Refuse a code any OTHER active operator already answers to. */
async function assertCodeFree(code: string, exceptId?: string) {
  const others = await prisma.operator.findMany({
    where: { status: "ACTIVE", ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true, codeHash: true, codeSalt: true },
  });
  const clash = others.find((o) => verifyCode(code, o.codeHash, o.codeSalt));
  if (clash) die('That code is already in use by "' + clash.name + '". Pick another.');
}

async function list() {
  const operators = await prisma.operator.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
  if (!operators.length) {
    console.log(D("No operators yet. Create one with: npm run operator -- create --name … --role … --code …"));
    return;
  }
  const members = await prisma.member.findMany({ select: { id: true, code: true } });
  const byId = new Map(members.map((m) => [m.id, m.code]));

  console.log(B("\n  Operators\n"));
  for (const op of operators) {
    const scope = op.memberId ? byId.get(op.memberId) ?? "(unknown member)" : "PLATFORM — all members";
    const locked = op.lockedUntil && op.lockedUntil > new Date();
    const rights = effectiveRights(op.role, op.rights);
    console.log(
      "  " +
        (op.status === "ACTIVE" && !locked ? G("●") : R("●")) +
        " " +
        B(op.name.padEnd(24)) +
        " " +
        op.role.padEnd(13) +
        " " +
        scope,
    );
    console.log(
      D(
        "      rights: " +
          (rights.includes(WILDCARD)
            ? "* (every right — " + expandForDisplay(rights).length + " of them)"
            : rights.join(", ")),
      ),
    );
    if (locked) console.log(R("      LOCKED until " + op.lockedUntil!.toISOString()));
    if (op.status !== "ACTIVE") console.log(R("      " + op.status));
    if (op.lastLoginAt) console.log(D("      last sign-in " + op.lastLoginAt.toISOString()));
  }
  console.log();
}

async function create() {
  const name = arg("name") ?? die("--name is required");
  const role = (arg("role") ?? "ANALYST").toUpperCase();
  const code = arg("code") ?? die("--code is required (four digits)");
  const memberCode = arg("member");
  const extra = (arg("rights") ?? "").split(",").map((r) => r.trim()).filter(Boolean);

  if (!ROLES.includes(role as (typeof ROLES)[number])) die("--role must be one of: " + ROLES.join(", "));
  if (!isWellFormedCode(code)) die("--code must be exactly four digits.");

  // A platform operator is defined by having NO member. Accepting --member on a
  // SUPER_ADMIN would create something that looks platform-wide in the console
  // and is quietly scoped in the database.
  if (role === "SUPER_ADMIN" && memberCode) die("SUPER_ADMIN is a platform role and cannot be scoped to --member.");
  if (role !== "SUPER_ADMIN" && !memberCode) die("--member is required for " + role + ".");

  for (const r of extra) if (r !== WILDCARD && !isRight(r)) die('Unknown right "' + r + '".');
  const rights = role === "SUPER_ADMIN" ? [WILDCARD] : extra;
  const bad = validateGrant(role, rights);
  if (bad) die(bad);

  const memberId = await resolveMemberId(memberCode);
  const existing = await prisma.operator.findFirst({ where: { name, memberId } });
  await assertCodeFree(code, existing?.id);

  const { codeHash, codeSalt } = hashCode(code);
  const data = {
    name,
    role: role as (typeof ROLES)[number],
    memberId,
    codeHash,
    codeSalt,
    rights,
    status: "ACTIVE" as const,
    failedAttempts: 0,
    lockedUntil: null,
  };

  const op = existing
    ? await prisma.operator.update({ where: { id: existing.id }, data })
    : await prisma.operator.create({ data });

  await prisma.operatorAudit.create({
    data: { operatorId: op.id, action: existing ? "CODE_ROTATED" : "CREATED", detail: role },
  });

  const effective = effectiveRights(op.role, op.rights);
  console.log(G(existing ? "\n✓ Operator updated" : "\n✓ Operator created"));
  console.log("  " + B(op.name) + "  ·  " + op.role + "  ·  " + (memberCode ?? "PLATFORM — all members"));
  console.log(
    "  rights: " +
      (effective.includes(WILDCARD)
        ? "* — every right (" + expandForDisplay(effective).length + ")"
        : effective.join(", ")),
  );
  console.log(D("  Sign in at the gate → Access Code → " + code + "\n"));
}

async function recode() {
  const name = arg("name") ?? die("--name is required");
  const code = arg("code") ?? die("--code is required (four digits)");
  if (!isWellFormedCode(code)) die("--code must be exactly four digits.");

  const op = await prisma.operator.findFirst({ where: { name } });
  if (!op) die('No operator named "' + name + '".');
  await assertCodeFree(code, op.id);

  const { codeHash, codeSalt } = hashCode(code);
  await prisma.operator.update({
    where: { id: op.id },
    data: { codeHash, codeSalt, failedAttempts: 0, lockedUntil: null },
  });
  await prisma.operatorAudit.create({ data: { operatorId: op.id, action: "CODE_ROTATED" } });
  console.log(G("✓ New code set for " + op.name));
}

async function setStatus(status: "ACTIVE" | "DISABLED") {
  const name = arg("name") ?? die("--name is required");
  const op = await prisma.operator.findFirst({ where: { name } });
  if (!op) die('No operator named "' + name + '".');
  await prisma.operator.update({ where: { id: op.id }, data: { status } });
  console.log(G("✓ " + op.name + " is now " + status));
}

async function unlock() {
  const name = arg("name") ?? die("--name is required");
  const op = await prisma.operator.findFirst({ where: { name } });
  if (!op) die('No operator named "' + name + '".');
  await prisma.operator.update({ where: { id: op.id }, data: { failedAttempts: 0, lockedUntil: null } });
  console.log(G("✓ " + op.name + " unlocked"));
}

async function main() {
  const command = process.argv[2];
  switch (command) {
    case "list": return list();
    case "create": return create();
    case "recode": return recode();
    case "disable": return setStatus("DISABLED");
    case "enable": return setStatus("ACTIVE");
    case "unlock": return unlock();
    default:
      console.log(
        [
          "",
          B("  Interchange operator administration"),
          "",
          "    npm run operator -- list",
          "    npm run operator -- create  --name <name> --role <role> --code <4 digits> [--member <code>] [--rights a,b]",
          "    npm run operator -- recode  --name <name> --code <4 digits>",
          "    npm run operator -- disable --name <name>",
          "    npm run operator -- enable  --name <name>",
          "    npm run operator -- unlock  --name <name>",
          "",
          D("    roles: " + ROLES.join(" · ")),
          "",
        ].join("\n"),
      );
      process.exit(command ? 1 : 0);
  }
}

main()
  .catch((e) => {
    console.error(R("✗ " + (e instanceof Error ? e.message : String(e))));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
