// ─────────────────────────────────────────────────────────────────────────────
// Promote a member out of the shadow period.
//
//   npx tsx scripts/promote-member.ts                    # show all candidates
//   npx tsx scripts/promote-member.ts KE/LENDER/AXE-3003 --by "Faith Birgen"
//
// SHADOW means contributing but not yet querying. Promotion is not a courtesy —
// it is the policy engine confirming that reciprocity has actually been met:
// the shadow period served, enough loans published, and a contribution recent
// enough to still be worth something. Those conditions live in
// lib/onboarding.ts and are checked here rather than assumed, so a member can
// never be promoted by someone simply deciding they should be.
//
// Every promotion writes a GovernanceAction. A member-governed network cannot
// have access changes that leave no record of who made them.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { promotionCandidates, promote } from "../lib/onboarding";

const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const code = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const decidedBy = arg("by") ?? "operator";

  const checks = await promotionCandidates();

  if (!code) {
    if (checks.length === 0) {
      console.log("\n  No members are in the shadow period.\n");
      return;
    }
    console.log(`\n\x1b[1mShadow members\x1b[0m`);
    for (const c of checks) {
      console.log(
        `  ${c.eligible ? G("eligible") : R("waiting ")} ${c.memberCode.padEnd(20)} ${D(c.reason)}`,
      );
    }
    console.log(`\n  ${D("Promote one:  npx tsx scripts/promote-member.ts <CODE> --by \"<your name>\"")}\n`);
    return;
  }

  const member = await promote(code, decidedBy);
  console.log(
    `\n  ${G("✓")} ${member.code} — ${member.name} is now ${member.status}` +
      `\n    ${D(`It may now query the network as well as contribute to it. Recorded against "${decidedBy}".`)}\n`,
  );
}

main().catch((e) => {
  console.error(`\n  ${R("✗")} ${e.message}\n`);
  process.exit(1);
});
