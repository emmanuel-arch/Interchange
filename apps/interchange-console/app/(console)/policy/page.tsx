import { cookies } from "next/headers";
import { PageHeader, Panel, Pill } from "@/components/chrome";
import { SESSION_COOKIE, readSession } from "@/lib/session";
import { can } from "@/lib/rights";
import { getPolicy } from "@/lib/statement/policy-store";
import { DEFAULT_POLICY, policyDiff } from "@/lib/statement/policy";
import { PolicyForm } from "./policy-form";

export const dynamic = "force-dynamic";

/**
 * Crunch settings — the surface a member admin uses to say how their statements
 * should be read.
 *
 * It exists because the alternative is a support ticket. Every lender in this
 * market has a view on what counts as income and what a borrower can afford,
 * those views differ, and they are all defensible. Hard-coding one of them
 * means every other member is quietly underwriting on somebody else's credit
 * policy — and never finds out, because the report does not say whose.
 */
export default async function PolicyPage() {
  const jar = await cookies();
  const session = readSession(jar.get(SESSION_COOKIE)?.value);
  const memberCode = session?.member ?? "default";
  const resolved = await getPolicy(memberCode);
  const diff = policyDiff(resolved.policy);
  const writable = can(session?.rights, "policy:write");

  return (
    <>
      <PageHeader
        eyebrow="Statement Crunch"
        title="Crunch settings"
        lede="How this member's M-PESA statements are read. These settings move the instalment ceiling, the score and every chart on a Cashflow & Affordability report — so the report prints them on its method page, and a figure can be defended a year later by showing what produced it."
        right={
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">Acting for</div>
            <div className="font-mono text-sm text-white/80 mt-1">{memberCode}</div>
          </div>
        }
      />

      {resolved.source === "fallback" ? (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-[13px] text-amber-100/90">
          {resolved.problem} Reports produced right now carry the Interchange defaults and say so on their method page.
        </div>
      ) : null}

      {!writable ? (
        <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[13px] text-white/60">
          You can see these settings but not change them. Changing a debt-service cap or a score weight is a credit
          decision, so it needs <span className="font-mono text-white/80">policy:write</span> — held by a member admin.
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.07] border border-white/[0.07] rounded-xl overflow-hidden mb-7">
        {[
          { v: resolved.source === "member" ? "Custom" : "Default", l: "Settings in use" },
          { v: String(diff.length), l: "Changed from default" },
          { v: `${Math.round(resolved.policy.affordability.dsrCap * 100)}%`, l: "Debt service cap" },
          { v: resolved.policy.updatedAt, l: "Last changed" },
        ].map((s) => (
          <div key={s.l} className="bg-[#070a09] px-4 py-4">
            <div className="font-mono text-xl font-bold tabular-nums text-emerald-400 leading-none mb-2">{s.v}</div>
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">{s.l}</div>
          </div>
        ))}
      </div>

      <PolicyForm initial={resolved.policy} fallback={DEFAULT_POLICY} writable={writable} memberCode={memberCode} />

      <div className="mt-7">
        <Panel title="Changed from the Interchange default" hint={`${diff.length} setting${diff.length === 1 ? "" : "s"}`}>
          {diff.length ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left font-mono text-[9px] uppercase tracking-[0.13em] text-white/35">
                  <th className="px-5 py-2 font-medium">Setting</th>
                  <th className="px-5 py-2 font-medium">This member</th>
                  <th className="px-5 py-2 font-medium">Interchange default</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((d) => (
                  <tr key={d.setting} className="border-t border-white/[0.05]">
                    <td className="px-5 py-2 text-white/80">{d.setting}</td>
                    <td className="px-5 py-2 font-mono text-emerald-300">{d.value}</td>
                    <td className="px-5 py-2 font-mono text-white/40">{d.default}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-4 text-[13px] text-white/50">
              Nothing. Reports produced now carry the Interchange defaults exactly as shipped.
            </p>
          )}
        </Panel>
      </div>

      <div className="mt-7">
        <Panel title="What is not configurable" hint="and will not become so">
          <div className="px-5 py-4 text-[13px] leading-relaxed text-white/55 space-y-2">
            <p>
              The facts. What the statement says, what Safaricom&rsquo;s own summary totals, which counterparties appear
              on the Central Bank of Kenya&rsquo;s registers, and how many months the declared period covers.
            </p>
            <p>
              A member configures how to <span className="text-white/80">read</span> the evidence. Nobody configures what
              the evidence is — a report whose underlying figures could be tuned would not be worth reading, and would
              not survive a regulator asking where a number came from.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
