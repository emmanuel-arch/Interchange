import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, Pill, Empty } from "@/components/chrome";
import { SCOPES, ALL_SCOPES, MANDATORY_SCOPES, OPTIONAL_SCOPES } from "@/lib/consent/scopes";
import { tokenPreview } from "@/lib/tokens";

export const dynamic = "force-dynamic";

function consentState(c: { revokedAt: Date | null; expiresAt: Date }) {
  if (c.revokedAt) return { tone: "bad" as const, label: "revoked" };
  if (c.expiresAt <= new Date()) return { tone: "bad" as const, label: "expired" };
  return { tone: "ok" as const, label: "active" };
}

export default async function ConsentPage() {
  const [consents, total, revoked, recentEvents] = await Promise.all([
    prisma.consent.findMany({
      orderBy: { capturedAt: "desc" },
      take: 25,
      include: { member: { select: { name: true, code: true } } },
    }),
    prisma.consent.count(),
    prisma.consent.count({ where: { NOT: { revokedAt: null } } }),
    prisma.consentEvent.findMany({
      orderBy: { at: "desc" },
      take: 12,
      include: { consent: { select: { ref: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Consent Center"
        lede="The ledger every Interchange call is checked against. No consent_ref, no answer — the gate refuses and records the refusal, so a member can always show what they did and did not send, and a borrower can always be shown who asked about them."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.07] border border-white/[0.07] rounded-xl overflow-hidden mb-7">
        {[
          { v: total.toLocaleString(), l: "Consents held" },
          { v: (total - revoked).toLocaleString(), l: "Currently active" },
          { v: revoked.toLocaleString(), l: "Revoked" },
          { v: `${MANDATORY_SCOPES.length}+${OPTIONAL_SCOPES.length}`, l: "Mandatory + optional scopes" },
        ].map((s) => (
          <div key={s.l} className="bg-[#070a09] px-4 py-4">
            <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 leading-none mb-2">{s.v}</div>
            <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="space-y-7">
        <Panel title="Scopes" hint="what a borrower actually agrees to">
          <ul className="divide-y divide-white/[0.05]">
            {ALL_SCOPES.map((s) => {
              const def = SCOPES[s];
              return (
                <li key={s} className="px-5 py-3.5 flex items-start gap-4">
                  <div className="w-44 shrink-0">
                    <div className="font-mono text-[10px] text-emerald-300/75">{s}</div>
                    <div className="mt-1">
                      <Pill tone={def.mandatory ? "ok" : "mute"}>
                        {def.mandatory ? "mandatory" : "optional"}
                      </Pill>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-white/70 mb-1">{def.label}</div>
                    <p className="text-[11.5px] text-white/40 leading-relaxed italic">
                      “{def.borrowerWording}”
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Consent ledger" hint={consents.length ? `latest ${consents.length}` : undefined}>
          {consents.length === 0 ? (
            <Empty>
              No consent captured yet — POST /api/consent to issue one
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    {["Ref", "Subject", "Captured by", "Via", "Scopes", "State", "Expires"].map((h) => (
                      <th key={h} className="px-5 py-2.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 font-bold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consents.map((c) => {
                    const st = consentState(c);
                    return (
                      <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3 font-mono text-[10px] text-white/60 whitespace-nowrap">{c.ref.slice(0, 16)}…</td>
                        {/* Never render a full subject token in a console. */}
                        <td className="px-5 py-3 font-mono text-[10px] text-emerald-300/60 whitespace-nowrap">{tokenPreview(c.subjectToken)}</td>
                        <td className="px-5 py-3 text-[12px] text-white/65 whitespace-nowrap">{c.member.name}</td>
                        <td className="px-5 py-3"><Pill tone="mute">{c.capturedVia}</Pill></td>
                        <td className="px-5 py-3 font-mono text-[10px] tabular-nums text-white/45">{c.scopes.length}</td>
                        <td className="px-5 py-3"><Pill tone={st.tone}>{st.label}</Pill></td>
                        <td className="px-5 py-3 font-mono text-[10px] text-white/35 whitespace-nowrap">
                          {c.expiresAt.toISOString().slice(0, 10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Consent events" hint="capture, validation, refusal, revocation">
          {recentEvents.length === 0 ? (
            <Empty>No events yet</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {recentEvents.map((e) => (
                <li key={e.id} className="px-5 py-2.5 flex items-center gap-4 text-[11px]">
                  <span className="font-mono text-white/30 w-36 shrink-0">
                    {e.at.toISOString().slice(0, 19).replace("T", " ")}
                  </span>
                  <span className="w-32 shrink-0">
                    <Pill tone={e.kind === "VALIDATED" || e.kind === "CAPTURED" ? "ok" : e.kind === "REVOKED" ? "pending" : "bad"}>
                      {e.kind}
                    </Pill>
                  </span>
                  <span className="font-mono text-white/40 w-40 shrink-0 truncate">{e.consent.ref.slice(0, 16)}…</span>
                  <span className="text-white/45 truncate">{e.serviceCode ?? ""} {e.detail ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
