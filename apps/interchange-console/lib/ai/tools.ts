// ─────────────────────────────────────────────────────────────────────────────
// ServiceSuite AI — the Interchange tool layer.
//
// THE ONE RULE: consent and access control live in the TOOL, never in the
// prompt. A system-prompt instruction is a suggestion to a language model; a
// check inside the tool is a wall. This distinction is what makes "Ask
// ServiceSuite AI" safe to put in front of a competitor's staff, and it is the
// first thing any security reviewer will test.
//
// Every tool below therefore:
//   · takes the caller's memberId from the SESSION, never from model output
//   · runs the same gate every member-to-member call runs
//   · writes an audit row whether it answered or refused
//
// A model cannot be talked into returning data the consent does not cover,
// because the model never touches the data — it asks for a tool call, and the
// tool decides.
//
// Blueprint v2 §6: the moat is the data and the tools, not the weights. A
// frontier model on top of these tools answers questions no competitor can
// match, whatever model they run.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { authorise } from "@/lib/consent/gate";
import { computeVector } from "@/lib/features/store";
import { champion, scoreWith } from "@/lib/scoring/registry";
import { isSubjectToken, tokenPreview } from "@/lib/oprf/node";

export type ToolContext = {
  /** Resolved from the session. NEVER from anything the model produced. */
  callerMemberId: string;
  callerCode: string;
};

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; refused: string; reason: string };

export type ToolDef = {
  name: string;
  description: string;
  /** The Interchange service this maps to — determines the consent scopes needed. */
  service: string;
  input: Record<string, string>;
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolResult>;
};

/** Every data tool goes through here. There is no other path to borrower data. */
async function gated(
  ctx: ToolContext,
  service: string,
  subjectToken: string,
  consentRef: string | null,
  produce: () => Promise<unknown>,
): Promise<ToolResult> {
  if (!isSubjectToken(subjectToken)) {
    return {
      ok: false,
      refused: "IDENTIFIER_NOT_TOKENISED",
      reason:
        "subject_token is not an OPRF output. Identity must be tokenised inside the node before it reaches a tool.",
    };
  }

  const decision = await authorise({
    callerId: ctx.callerMemberId,
    serviceCode: service,
    subjectToken,
    consentRef,
  });

  if (!decision.ok) {
    return { ok: false, refused: decision.outcome, reason: decision.reason };
  }

  return { ok: true, data: await produce() };
}

export const TOOLS: ToolDef[] = [
  {
    name: "interchange_exposure",
    description:
      "Live multi-lender exposure for one borrower: active loans, distinct lenders, outstanding band, worst arrears bucket and recent credit velocity.",
    service: "exposure-v1",
    input: { subject_token: "OPRF token", consent_ref: "consent reference" },
    run: (ctx, args) =>
      gated(ctx, "exposure-v1", String(args.subject_token ?? ""), args.consent_ref ? String(args.consent_ref) : null, async () => {
        const holdings = await prisma.memberHolding.findMany({
          where: { subjectToken: String(args.subject_token), activeLoans: { gt: 0 } },
          select: { memberId: true, activeLoans: true, worstBucket: true, newestDisbursedAt: true },
        });
        return {
          active_loans: holdings.reduce((a, h) => a + h.activeLoans, 0),
          lenders: new Set(holdings.map((h) => h.memberId)).size,
          worst_bucket: holdings.map((h) => h.worstBucket).sort().pop() ?? null,
          newest_disbursement: holdings.map((h) => h.newestDisbursedAt).filter(Boolean).sort().pop() ?? null,
        };
      }),
  },
  {
    name: "interchange_features",
    description:
      "The borrower's feature vector as of now — the same definitions used to train the score, so the numbers agree with the model.",
    service: "report-3",
    input: { subject_token: "OPRF token", consent_ref: "consent reference" },
    run: (ctx, args) =>
      gated(ctx, "report-3", String(args.subject_token ?? ""), args.consent_ref ? String(args.consent_ref) : null, async () => {
        const v = await computeVector(String(args.subject_token), new Date());
        return { as_of: v.asOf, feature_set: v.featureSetVersion, values: v.values, unavailable: v.unavailableFamilies };
      }),
  },
  {
    name: "interchange_score",
    description:
      "The Interchange Score (300–850) with reason codes explaining what raised or lowered it.",
    service: "report-3",
    input: { subject_token: "OPRF token", consent_ref: "consent reference" },
    run: (ctx, args) =>
      gated(ctx, "report-3", String(args.subject_token ?? ""), args.consent_ref ? String(args.consent_ref) : null, async () => {
        const model = await champion();
        if (!model) return { error: "No champion model is registered." };
        const v = await computeVector(String(args.subject_token), new Date());
        const s = scoreWith(model, v.values);
        return {
          score: s.score,
          probability_of_default: Number(s.probability.toFixed(4)),
          model_version: s.modelVersion,
          reasons: s.reasons.map((r) => ({
            factor: r.explanation,
            direction: r.direction,
            family: r.family,
          })),
        };
      }),
  },
  {
    name: "interchange_benchmark",
    description:
      "Anonymised comparison of this member's book against the ecosystem. Contains no borrower-level data, so it needs no borrower consent.",
    service: "report-23",
    input: {},
    run: async (ctx) => {
      // No subject, no consent required — but still scoped to the CALLER, and
      // still only ever aggregate. A member can see the median; never a rival's
      // individual position.
      const me = await prisma.member.findUniqueOrThrow({ where: { id: ctx.callerMemberId } });
      const all = await prisma.member.findMany({
        where: { status: "ACTIVE" },
        select: { borrowers: true, loans: true },
      });
      const loans = all.map((m) => m.loans).sort((a, b) => a - b);
      const median = loans[Math.floor(loans.length / 2)] ?? 0;
      return {
        ok: true,
        data: {
          your_borrowers: me.borrowers,
          your_loans: me.loans,
          ecosystem_median_loans: median,
          ecosystem_members: all.length,
          your_percentile: Math.round((loans.filter((l) => l <= me.loans).length / loans.length) * 100),
        },
      };
    },
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/**
 * Execute a tool call and record it.
 *
 * `callerMemberId` comes from the caller's session. If a future refactor ever
 * makes it possible for a model-produced value to reach this parameter, the
 * whole guarantee collapses — a model that can name its own caller can read any
 * member's data.
 */
export async function runTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) {
    return { ok: false, refused: "UNKNOWN_TOOL", reason: `No tool named "${name}".` };
  }
  return tool.run(ctx, args);
}

/** The tool manifest, in the shape a model's tool-use API expects. */
export function manifest() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object" as const,
      properties: Object.fromEntries(
        Object.entries(t.input).map(([k, v]) => [k, { type: "string", description: v }]),
      ),
      required: Object.keys(t.input),
    },
  }));
}

export { tokenPreview };
