// ─────────────────────────────────────────────────────────────────────────────
// /reports — the report catalogue, what it costs, and how to call it.
//
// This is the surface a prospective member is shown in the first meeting, so it
// answers their three questions in the order they ask them: what can I get,
// what does it cost me, and what do I have to build. The fourth question —
// "does it actually work" — is answered by the preview, which runs a real
// signed, consented, logged call through the same endpoint a member would use.
// ─────────────────────────────────────────────────────────────────────────────
import { PageHeader, Panel, Pill, Empty, Num } from "@/components/chrome";
import { REPORTS, quote } from "@/lib/reports/catalogue";
import { RATE_CARD, cardCost } from "@/lib/codes/metropol-rate-card";
import { prisma } from "@/lib/prisma";
import { chromiumPath } from "@/lib/reports/render";
import { replayDir, contractHolder } from "@/lib/reports/source";

export const dynamic = "force-dynamic";

const DEV = process.env.NODE_ENV !== "production" && process.env.INTERCHANGE_DEV_OPEN_CONSOLE === "1";

const SOURCE_LABEL: Record<string, string> = {
  ecosystem: "Member books",
  bureau: "Metropol",
  hybrid: "Both",
};

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const sp = await searchParams;
  const previewId = typeof sp.id === "string" ? sp.id.trim() : "";
  const previewType = typeof sp.type === "string" ? sp.type : "12";

  const [recent, holder] = await Promise.all([
    prisma.auditEntry.findMany({
      where: { service: { kind: "REPORT" } },
      orderBy: { at: "desc" },
      take: 8,
      select: {
        at: true, outcome: true, latencyMs: true, subjectToken: true,
        caller: { select: { code: true } }, service: { select: { code: true, name: true } },
      },
    }).catch(() => []),
    Promise.resolve(contractHolder()),
  ]);

  const live = REPORTS.filter((r) => r.live);
  const renderer = chromiumPath();

  return (
    <>
      <PageHeader
        eyebrow="Plane A · reports-v1"
        title="Report Catalogue"
        lede="Every report the Interchange publishes, in JSON, HTML or PDF, through one signed endpoint. Ecosystem-native reports are free at the point of use to a contributing member; bureau-backed reports are the contract holder's cost plus a stated fee."
        right={
          <div className="text-right">
            <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">{live.length}</div>
            <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/35">live now</div>
          </div>
        }
      />

      {/* ── The catalogue ─────────────────────────────────────────────────── */}
      <Panel title="What a member can call" hint="report types mirror Metropol's where an equivalent exists">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-white/35 font-mono text-[8px] uppercase tracking-[0.14em]">
              <th className="text-left font-normal px-5 py-2.5">Type</th>
              <th className="text-left font-normal py-2.5">Report</th>
              <th className="text-left font-normal py-2.5">Source</th>
              <th className="text-right font-normal py-2.5">Bureau cost</th>
              <th className="text-right font-normal py-2.5">Our fee</th>
              <th className="text-right font-normal py-2.5">Per call</th>
              <th className="text-left font-normal px-5 py-2.5">State</th>
            </tr>
          </thead>
          <tbody>
            {REPORTS.map((r) => {
              const q = quote(r.type, { contributing: true })!;
              return (
                <tr key={r.type} className="border-t border-white/[0.05] align-top">
                  <td className="px-5 py-3 font-mono text-emerald-300/80 tabular-nums">{r.type}</td>
                  <td className="py-3">
                    <div className="text-white/85">{r.name}</div>
                    <div className="text-white/40 text-[11px] mt-0.5 max-w-[46ch] leading-relaxed">{r.answers}</div>
                    {r.edge ? (
                      <div className="text-emerald-400/60 text-[10.5px] mt-1 max-w-[52ch] leading-relaxed">{r.edge}</div>
                    ) : null}
                  </td>
                  <td className="py-3 text-white/55">{SOURCE_LABEL[r.source]}</td>
                  <td className="py-3 text-right font-mono tabular-nums text-white/55">
                    {r.bureauCost ? r.bureauCost.toLocaleString() : "—"}
                    {cardCost(r.bureauReports).unpriced.length ? (
                      <span className="text-amber-300/70" title={`Report ${cardCost(r.bureauReports).unpriced.join(", ")} is not on the rate card and is not included`}>
                        {" "}+{cardCost(r.bureauReports).unpriced.join(",")}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums text-white/55">
                    {r.interchangeFee ? r.interchangeFee.toLocaleString() : "—"}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums">
                    {q.freeAtPointOfUse ? (
                      <span className="text-emerald-400">free</span>
                    ) : (
                      <span className="text-white/85">KES {q.total.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Pill tone={r.live ? "ok" : "mute"}>{r.live ? "live" : "specified"}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-5 py-3.5 border-t border-white/[0.06] text-[11px] text-white/45 leading-relaxed">
          Bureau costs are Metropol&apos;s <strong className="text-white/70">{RATE_CARD.title}</strong>, per request, net —
          the bureau&apos;s invoice adds {RATE_CARD.excisePct}% excise and {RATE_CARD.vatPct}% VAT on top.{" "}
          <span className="text-amber-300/70">
            A figure marked +16 includes report 16, which the card does not price; it is quoted without it rather than
            guessed.
          </span>
        </div>
      </Panel>

      {/* ── Reciprocity ───────────────────────────────────────────────────── */}
      <div className="mt-7 grid md:grid-cols-2 gap-3">
        <Panel title="Why the ecosystem reports are free">
          <div className="px-5 py-4 text-[12px] text-white/60 leading-relaxed space-y-2.5">
            <p>
              Exposure, delinquency, intent and cohort are computed from members&apos; own live books. The marginal cost of
              answering is milliseconds of somebody else&apos;s Postgres, so charging per query would be rent rather than
              price.
            </p>
            <p>
              What a member pays instead is <strong className="text-white/85">contribution</strong>. Publish your book and
              you may query the network. Stop publishing and the free tier goes to zero — enforced in the policy engine,
              within one configuration cycle, not in a contract clause.
            </p>
          </div>
        </Panel>
        <Panel title="Why the bureau reports are not">
          <div className="px-5 py-4 text-[12px] text-white/60 leading-relaxed space-y-2.5">
            <p>
              A Metropol pull costs real money on a real contract. The member holding it —{" "}
              <span className="font-mono text-emerald-300/80">{holder?.code ?? "not configured"}</span> — makes the call
              and is reimbursed; the Interchange adds a fee that is printed on the invoice rather than buried in a
              blended rate.
            </p>
            <p>
              Thirteen of Metropol&apos;s fourteen report types are entitled on that contract, swept live on 16 Sep 2026.
              Report 22 is refused (E029) and is not sold.
            </p>
          </div>
        </Panel>
      </div>

      {/* ── How to call it ────────────────────────────────────────────────── */}
      <div className="mt-7">
        <Panel title="The call" hint="one endpoint, three formats">
          <pre className="px-5 py-4 overflow-x-auto font-mono text-[10.5px] leading-relaxed text-white/60">
{`POST /api/v1/report
x-interchange-member:     KE/LENDER/3005
x-interchange-timestamp:  2026-09-16T08:14:22.104Z
x-interchange-nonce:      b7f1…
x-interchange-signature:  Ed25519 over METHOD\\nPATH\\nSHA256(body)\\nts\\nnonce\\nmember

{ "report_type": 12,
  "identity_number": "30058967",     // bureau reports only — Metropol key on the ID
  "consent_ref": "csn_…",            // no consent_ref, no answer
  "format": "json" | "html" | "pdf" }

→ 200  x-interchange-log-seq: 12
       x-interchange-log-hash: 0e1ff192…      ← your receipt, re-verifiable at /api/log/verify
       x-interchange-billed-pulls: 4`}
          </pre>
          <div className="px-5 pb-4 text-[11px] text-white/40 leading-relaxed">
            The envelope is Metropol-shaped on purpose — same request keys, same <span className="font-mono">api_code</span>{" "}
            semantics, same report-type integers where an equivalent exists. A member already integrated with Metropol
            changes a base URL and a key pair. What differs is the authentication: an Ed25519 signature over the
            canonical request, so a call cannot be replayed, forged from a log, or later denied.
          </div>
        </Panel>
      </div>

      {/* ── Preview ───────────────────────────────────────────────────────── */}
      {DEV ? (
        <div className="mt-7">
          <Panel
            title="Preview"
            hint={replayDir() ? "replaying a captured bureau answer — nothing is billed" : "live bureau pull — billed"}
          >
            <form method="GET" className="px-5 py-5 flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <label htmlFor="id" className="block font-mono text-[8px] uppercase tracking-[0.16em] text-white/35 mb-2">
                  National ID
                </label>
                <input
                  id="id"
                  name="id"
                  defaultValue={previewId}
                  placeholder="30058967"
                  autoComplete="off"
                  className="w-full bg-black/30 border border-white/[0.09] focus:border-emerald-500/40 rounded-lg px-3 py-2.5 font-mono text-sm text-white/85 placeholder:text-white/15 outline-none tracking-[0.08em]"
                />
              </div>
              <div>
                <label htmlFor="type" className="block font-mono text-[8px] uppercase tracking-[0.16em] text-white/35 mb-2">
                  Report
                </label>
                <select
                  id="type"
                  name="type"
                  defaultValue={previewType}
                  className="bg-black/30 border border-white/[0.09] rounded-lg px-3 py-2.5 font-mono text-sm text-white/85 outline-none"
                >
                  {live.map((r) => (
                    <option key={r.type} value={r.type} className="bg-[#0b0f0e]">
                      {r.type} · {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300 transition-colors cursor-pointer"
              >
                Render
              </button>
            </form>

            {previewId ? (
              <div className="px-5 pb-5">
                <div className="flex gap-2 mb-3 flex-wrap">
                  {(["html", "json", "pdf"] as const).map((f) => (
                    <a
                      key={f}
                      href={`/api/dev/report-preview?id=${encodeURIComponent(previewId)}&type=${previewType}&format=${f}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-md border border-white/[0.1] hover:border-emerald-500/30 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55 hover:text-emerald-300 transition-colors"
                    >
                      open {f}
                      {f === "pdf" && !renderer ? " (no renderer)" : ""}
                    </a>
                  ))}
                </div>
                <div className="rounded-lg overflow-hidden border border-white/[0.08] bg-white">
                  <iframe
                    key={`${previewId}-${previewType}`}
                    src={`/api/dev/report-preview?id=${encodeURIComponent(previewId)}&type=${previewType}&format=html`}
                    className="w-full"
                    style={{ height: 720 }}
                    title="Report preview"
                  />
                </div>
              </div>
            ) : (
              <div className="px-5 pb-5 text-[12px] text-white/45 leading-relaxed">
                Enter a national ID to run a real call: tokenised, consented, gated, logged, and rendered by the same
                code a member&apos;s node would reach.{" "}
                {replayDir() ? (
                  <span className="text-amber-300/70">
                    Bureau answers are being replayed from a captured pull, so nothing is billed and every rendered
                    document is stamped REPLAY.
                  </span>
                ) : null}
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {/* ── Recent calls ──────────────────────────────────────────────────── */}
      <div className="mt-7">
        <Panel title="Recent report calls" hint="from the audit trail">
          {recent.length === 0 ? (
            <Empty>No report has been called yet</Empty>
          ) : (
            <table className="w-full text-[12px]">
              <tbody>
                {recent.map((a, i) => (
                  <tr key={i} className="border-t border-white/[0.05] first:border-t-0">
                    <td className="px-5 py-2.5 font-mono text-[10px] text-white/35">
                      {a.at.toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-white/60">{a.caller.code}</td>
                    <td className="py-2.5 text-white/75">{a.service.name}</td>
                    <td className="py-2.5 font-mono text-[10px] text-emerald-300/50">
                      {a.subjectToken.slice(0, 10)}…
                    </td>
                    <td className="py-2.5 text-right font-mono text-[10px] text-white/40">
                      {a.latencyMs !== null ? <Num>{a.latencyMs}ms</Num> : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Pill tone={a.outcome === "GRANTED" ? "ok" : "bad"}>{a.outcome.replace("REFUSED_", "")}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
