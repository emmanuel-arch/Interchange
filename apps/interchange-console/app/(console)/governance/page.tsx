import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, Pill, Empty, memberTone } from "@/components/chrome";
import { promotionCandidates, SHADOW_PERIOD_DAYS, PROMOTION_REQUIREMENTS } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

const OPERATING_ENTITY = process.env.INTERCHANGE_OPERATOR ?? "BirgenAI (subsidiary — pending incorporation)";
const PRIMARY_DOMAIN = process.env.INTERCHANGE_PRIMARY_DOMAIN ?? "interchange.servicesuitecloud.com";
const NEUTRAL_DOMAIN = process.env.INTERCHANGE_NEUTRAL_DOMAIN ?? "interchange.africa";

export default async function GovernancePage() {
  const [applications, actions, members, candidates] = await Promise.all([
    prisma.memberApplication.findMany({ orderBy: { submittedAt: "desc" }, take: 20 }),
    prisma.governanceAction.findMany({ orderBy: { at: "desc" }, take: 20 }),
    prisma.member.findMany({ orderBy: { code: "asc" } }),
    promotionCandidates(),
  ]);

  const byStatus = (s: string) => members.filter((m) => m.status === s).length;
  const eligible = candidates.filter((c) => c.eligible).length;

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Governance"
        lede="Who is in, who decided, and on what grounds. BirgenAI operates the Interchange while also selling lending software to some of its members — a competitor will name that conflict in the first meeting, and the answer cannot be 'trust us'. It has to be a record every member can read."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/[0.07] border border-white/[0.07] rounded-xl overflow-hidden mb-7">
        {[
          { v: String(byStatus("ACTIVE")), l: "Active" },
          { v: String(byStatus("SHADOW")), l: "In shadow" },
          { v: String(byStatus("PROSPECT")), l: "Prospects" },
          { v: String(byStatus("SUSPENDED")), l: "Suspended" },
          { v: String(eligible), l: "Ready to promote" },
        ].map((s) => (
          <div key={s.l} className="bg-[#070a09] px-4 py-4">
            <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 leading-none mb-2">{s.v}</div>
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="space-y-7">
        <Panel title="Operating entity & domain" hint="the conflict, stated">
          <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-5 text-[12px]">
            {[
              ["Operator", OPERATING_ENTITY],
              ["Primary domain", PRIMARY_DOMAIN],
              ["Neutral domain", NEUTRAL_DOMAIN],
            ].map(([l, v]) => (
              <div key={l}>
                <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 mb-1">{l}</div>
                <div className="font-mono text-white/75 break-all">{v}</div>
              </div>
            ))}
          </div>
          <p className="px-5 pb-4 text-[11.5px] text-white/45 leading-relaxed max-w-[78ch]">
            Launching on the ServiceSuite domain borrows credibility that has already been earned.
            But a lender is being asked to join a network that appears, by its address, to belong to
            a company that sells to its competitors. Neutral branding is not cosmetic — it is part of
            the trust architecture, and it should move on the same timeline as the governing entity.
          </p>
        </Panel>

        <Panel title="Shadow period" hint={`${SHADOW_PERIOD_DAYS} days, then three conditions`}>
          {candidates.length === 0 ? (
            <Empty>No members in the shadow period</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    {["Member", "Period served", "Volume", "Recency", "Verdict", "Detail"].map((h) => (
                      <th key={h} className="px-5 py-2.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.memberCode} className="border-b border-white/[0.04]">
                      <td className="px-5 py-2.5 font-mono text-[10px] text-white/70">{c.memberCode}</td>
                      <td className="px-5 py-2.5"><Pill tone={c.servedPeriod ? "ok" : "pending"}>{c.servedPeriod ? "yes" : "no"}</Pill></td>
                      <td className="px-5 py-2.5"><Pill tone={c.contributesEnough ? "ok" : "pending"}>{c.contributesEnough ? "yes" : "no"}</Pill></td>
                      <td className="px-5 py-2.5"><Pill tone={c.contributesRecently ? "ok" : "pending"}>{c.contributesRecently ? "yes" : "no"}</Pill></td>
                      <td className="px-5 py-2.5"><Pill tone={c.eligible ? "ok" : "mute"}>{c.eligible ? "promote" : "hold"}</Pill></td>
                      <td className="px-5 py-2.5 text-[11px] text-white/45">{c.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-5 py-3 text-[11.5px] text-white/45 leading-relaxed max-w-[78ch] border-t border-white/[0.05]">
            Time served is necessary but not sufficient. A member also has to have published at least{" "}
            {PROMOTION_REQUIREMENTS.minLoansPublished} loans and contributed within{" "}
            {PROMOTION_REQUIREMENTS.maxDaysSinceContribution} days — someone who sat out the period
            publishing nothing has demonstrated the opposite of what the period is for.
          </p>
        </Panel>

        <Panel title="Applications" hint={`${applications.length} recent`}>
          {applications.length === 0 ? (
            <Empty>No applications — POST /api/onboard to apply</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    {["Organisation", "Contact", "Book claimed", "Key", "Status", "Submitted"].map((h) => (
                      <th key={h} className="px-5 py-2.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {applications.map((a) => (
                    <tr key={a.id} className="border-b border-white/[0.04]">
                      <td className="px-5 py-2.5 text-[12px] text-white/80">{a.organisation}</td>
                      <td className="px-5 py-2.5 text-[11px] text-white/45">{a.contactEmail}</td>
                      <td className="px-5 py-2.5 font-mono text-[10px] tabular-nums text-white/50">
                        {a.claimedLoans.toLocaleString()} <span className="text-white/25">loans</span>
                      </td>
                      <td className="px-5 py-2.5"><Pill tone={a.publicKey ? "ok" : "pending"}>{a.publicKey ? "proved" : "pending"}</Pill></td>
                      <td className="px-5 py-2.5"><Pill tone={a.status === "ADMITTED" ? "ok" : a.status === "REJECTED" ? "bad" : "pending"}>{a.status}</Pill></td>
                      <td className="px-5 py-2.5 font-mono text-[9px] text-white/30">{a.submittedAt.toISOString().slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Decision record" hint="every admission, suspension and promotion">
          {actions.length === 0 ? (
            <Empty>No governance actions recorded</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {actions.map((a) => (
                <li key={a.id} className="px-5 py-2.5 flex items-start gap-4 text-[11.5px]">
                  <span className="font-mono text-white/30 w-28 shrink-0">{a.at.toISOString().slice(0, 10)}</span>
                  <span className="w-44 shrink-0"><Pill tone={a.action === "SUSPEND" || a.action === "REJECT" ? "bad" : "ok"}>{a.action}</Pill></span>
                  <span className="font-mono text-white/55 w-36 shrink-0">{a.memberCode ?? "—"}</span>
                  <span className="text-white/40 w-32 shrink-0">{a.decidedBy}</span>
                  <span className="text-white/50">{a.rationale}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Membership" hint={`${members.length} organisations`}>
          <div className="px-5 py-4 flex flex-wrap gap-2">
            {members.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-2 border border-white/[0.07] rounded px-2.5 py-1">
                <span className="text-[11px] text-white/70">{m.name}</span>
                <Pill tone={memberTone(m.status)}>{m.status}</Pill>
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
