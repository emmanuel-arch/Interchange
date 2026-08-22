// ─────────────────────────────────────────────────────────────────────────────
// Sprint 5 acceptance: the Interchange Score and the AI tool layer.
//
//   npx tsx scripts/verify-scoring.ts
//
// The first test is the one that matters most, and it is the one people skip:
// prove the TRAINER can find signal, using a dataset where the answer is known.
// Reporting an AUC from the lending fixture proves nothing on its own — a broken
// trainer and a weak dataset produce the same number. Separating the two is the
// difference between measuring and hoping.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { trainLogistic, predictLogistic, contributionsLogistic, toScore, type Row } from "../lib/scoring/model";
import { auc, ks, train, monotonicityViolations } from "../lib/scoring/train";
import { champion, challengers, comparePromotion, scoreWith, vectorFrom } from "../lib/scoring/registry";
import { runTool, manifest } from "../lib/ai/tools";
import { computeVector } from "../lib/features/store";
import { MANDATORY_SCOPES } from "../lib/consent/scopes";
import { FEATURE_NAMES } from "../lib/features/definitions";
import { randomBytes } from "crypto";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(52)} ${detail}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(52)} ${detail}`); }
}

async function main() {
  console.log("\nInterchange Sprint 5 acceptance — score and tools\n");

  // ── Does the trainer work at all? ───────────────────────────────────────
  console.log("  \x1b[2mTrainer — recover a signal that is known to be there\x1b[0m");

  // Two clearly separated Gaussians on feature 0, noise on the rest.
  const names = ["signal", "noise_a", "noise_b"];
  const synth: Row[] = [];
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 600; i++) {
    const y = i % 2;
    synth.push({ x: [y * 2 + rnd(), rnd(), rnd()], y });
  }
  const sm = trainLogistic(synth, names, { epochs: 2000 });
  const sAuc = auc(synth.map((r) => predictLogistic(sm, r.x)), synth.map((r) => r.y));
  check("recovers a strong planted signal", sAuc > 0.9, `AUC ${sAuc.toFixed(3)} on separable data`);
  check(
    "puts the weight on the signal, not the noise",
    Math.abs(sm.weights[0]) > Math.abs(sm.weights[1]) * 3,
    `w_signal ${sm.weights[0].toFixed(2)} vs noise ${sm.weights[1].toFixed(2)}, ${sm.weights[2].toFixed(2)}`,
  );

  // Contributions are exact for a linear model: they must sum to the logit.
  const x0 = synth[0].x;
  const contribs = contributionsLogistic(sm, x0);
  const summed = contribs.reduce((a, c) => a + c.contribution, 0) + sm.bias;
  const p = predictLogistic(sm, x0);
  const logit = Math.log(p / (1 - p));
  check(
    "reason-code contributions sum exactly to the logit",
    Math.abs(summed - logit) < 1e-6,
    `Σcontrib + bias = ${summed.toFixed(6)}, logit = ${logit.toFixed(6)}`,
  );

  const rand = auc(synth.map(() => rnd()), synth.map((r) => r.y));
  check("random scores land near 0.5", Math.abs(rand - 0.5) < 0.08, `AUC ${rand.toFixed(3)}`);

  // ── The real model ──────────────────────────────────────────────────────
  console.log("\n  \x1b[2mThe lending model — measured, not flattered\x1b[0m");

  const champ = await champion();
  check("a champion is registered", !!champ, champ?.version ?? "none");

  const real = await train("logistic");
  check(
    "every declared feature direction is respected",
    monotonicityViolations(real.params).length === 0,
    "monotonic constraints hold after training",
  );
  check(
    "the split is out-of-time, not random",
    real.trainEnd <= real.testStart,
    `train ends ${real.trainEnd.toISOString().slice(0, 10)}, test starts ${real.testStart.toISOString().slice(0, 10)}`,
  );
  check(
    "training set includes reject-inferred rows",
    real.metrics.ecosystemRows > 0,
    `${real.metrics.ecosystemRows} of ${real.trainRows} rows are applicants we declined`,
  );
  console.log(
    `    \x1b[2m→ held-out AUC ${real.metrics.auc.toFixed(3)}, KS ${real.metrics.ks.toFixed(3)} on ${real.metrics.n} rows / ${real.metrics.bads} bad.\x1b[0m`,
  );
  console.log(
    `    \x1b[2m  Weak, and reported as weak: this fixture's outcomes are deliberately noisy, and\x1b[0m`,
  );
  console.log(
    `    \x1b[2m  the strongest real predictors (38 M-Pesa cashflow features) are not wired yet.\x1b[0m`,
  );

  // ── Champion / challenger ───────────────────────────────────────────────
  console.log("\n  \x1b[2mChampion / challenger\x1b[0m");

  const chal = await challengers();
  check("challengers are registered but do not decide", chal.length > 0, `${chal.length} challenger(s) shadow-scoring`);

  const comparisons = await comparePromotion();
  check(
    "promotion needs real lift, not a rounding error",
    comparisons.every((c) => c.verdict === "hold" || (c.challengerAuc ?? 0) - (c.championAuc ?? 0) >= 0.02),
    comparisons.map((c) => `${c.verdict}`).join(", "),
  );

  // ── Scoring a real borrower ─────────────────────────────────────────────
  console.log("\n  \x1b[2mServing\x1b[0m");

  const anyDecision = await prisma.decision.findFirstOrThrow({ orderBy: { at: "desc" } });
  const vector = await computeVector(anyDecision.subjectToken, new Date());
  const scored = scoreWith(champ!, vector.values);

  check("score lands in the 300–850 band", scored.score >= 300 && scored.score <= 850, `${scored.score}`);
  check("reason codes are returned", scored.reasons.length > 0, `${scored.reasons.length} factors`);
  check(
    "reason codes are in plain language",
    scored.reasons.every((r) => r.explanation !== r.feature),
    `e.g. "${scored.reasons[0]?.explanation}" (${scored.reasons[0]?.direction})`,
  );
  check("score bands map monotonically", toScore(0.01) > toScore(0.5) && toScore(0.5) > toScore(0.9), `pd 1% → ${toScore(0.01)}, 50% → ${toScore(0.5)}, 90% → ${toScore(0.9)}`);

  // ── The tool layer ──────────────────────────────────────────────────────
  console.log("\n  \x1b[2mAI tools — consent enforced in the tool, not the prompt\x1b[0m");

  const micromart = await prisma.member.findUniqueOrThrow({ where: { code: "KE/LENDER/3005" } });
  const ctx = { callerMemberId: micromart.id, callerCode: micromart.code };

  check("tool manifest is exposed for tool-use", manifest().length >= 4, `${manifest().length} tools`);

  const noConsent = await runTool(ctx, "interchange_score", {
    subject_token: anyDecision.subjectToken,
  });
  check(
    "a tool call without consent is refused",
    !noConsent.ok && noConsent.refused === "REFUSED_NO_CONSENT",
    `${!noConsent.ok ? noConsent.refused : "ANSWERED"}`,
  );

  const rawId = await runTool(ctx, "interchange_score", {
    subject_token: "39362808",
    consent_ref: "csn_whatever",
  });
  check(
    "a raw identifier never reaches a tool",
    !rawId.ok && rawId.refused === "IDENTIFIER_NOT_TOKENISED",
    `${!rawId.ok ? rawId.refused : "ANSWERED"}`,
  );

  // With consent, it answers.
  const ref = `csn_${randomBytes(16).toString("hex")}`;
  await prisma.consent.create({
    data: {
      ref, subjectToken: anyDecision.subjectToken, memberId: micromart.id,
      scopes: MANDATORY_SCOPES, wordingVersion: "test", capturedVia: "PWA",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  const withConsent = await runTool(ctx, "interchange_score", {
    subject_token: anyDecision.subjectToken,
    consent_ref: ref,
  });
  check("with valid consent, the tool answers", withConsent.ok, withConsent.ok ? `score ${(withConsent.data as { score: number }).score}` : withConsent.reason);

  const unknown = await runTool(ctx, "nonexistent_tool", {});
  check("an invented tool name is refused", !unknown.ok && unknown.refused === "UNKNOWN_TOOL", "UNKNOWN_TOOL");

  // Revoke, and the same call must stop working — the tool re-checks every time.
  await prisma.consent.update({ where: { ref }, data: { revokedAt: new Date() } });
  const afterRevoke = await runTool(ctx, "interchange_score", {
    subject_token: anyDecision.subjectToken,
    consent_ref: ref,
  });
  check(
    "revocation stops the tool immediately",
    !afterRevoke.ok,
    `${!afterRevoke.ok ? afterRevoke.refused : "STILL ANSWERING"}`,
  );

  const bench = await runTool(ctx, "interchange_benchmark", {});
  check("aggregate tools need no borrower consent", bench.ok, "benchmark answered without a subject");

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
