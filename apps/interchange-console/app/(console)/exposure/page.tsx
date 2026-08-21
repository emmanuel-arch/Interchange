import { readFileSync } from "fs";
import { PageHeader, Panel, Pill, Empty } from "@/components/chrome";
import { canonicalIdentifier, tokenPreview } from "@/lib/oprf/node";
import { evaluateDirect } from "@/lib/oprf/registry";
import { fetchFilters, queryExposure, type ExposureResult } from "@/lib/exposure/broker";
import { ecosystemExposure } from "@/lib/reports/crb2";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ⚠ DEVELOPMENT SURFACE.
//
// This page acts as Micromart's NODE: it reads a member private key from
// .member-keys.json and derives tokens with the ecosystem key directly. Neither
// of those is something a console should ever do in production — in the deployed
// architecture the node holds its own key inside the member's perimeter, and
// tokens come from the blinded exchange, not from local possession of the
// ecosystem secret.
//
// It exists so the exposure engine can be seen working. Fenced behind the same
// flag as /api/session/dev.
const DEV = process.env.NODE_ENV !== "production" && process.env.INTERCHANGE_DEV_OPEN_CONSOLE === "1";

const CALLER = "KE/LENDER/3005";

const BUCKET_TONE: Record<string, "ok" | "pending" | "bad"> = {
  prepayment: "ok", due: "ok", watch_1: "pending", watch_2: "pending", watch_3: "bad", npl: "bad",
};

async function runQuery(nationalId: string): Promise<{ result: ExposureResult; token: string } | { error: string }> {
  try {
    const keys = JSON.parse(readFileSync(".member-keys.json", "utf8")) as Record<string, { secretKey: string }>;
    const input = new TextEncoder().encode(canonicalIdentifier("national_id", nationalId));
    const token = evaluateDirect(process.env.INTERCHANGE_OPRF_KEY!, input);

    const base = process.env.INTERCHANGE_SELF_URL ?? "http://127.0.0.1:3000";
    const [filters, members] = await Promise.all([
      fetchFilters(base),
      prisma.member.findMany({ where: { status: { in: ["ACTIVE", "SHADOW"] } }, select: { code: true } }),
    ]);

    const result = await queryExposure({
      baseUrl: base,
      callerCode: CALLER,
      callerSecretKey: keys[CALLER].secretKey,
      memberCodes: members.map((m) => m.code),
      filters,
      subjectToken: token,
      discloseLenders: false,
    });
    return { result, token };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export default async function ExposurePage({ searchParams }: PageProps<"/exposure">) {
  const sp = await searchParams;
  const nationalId = typeof sp.id === "string" ? sp.id.trim() : "";

  const outcome = DEV && nationalId ? await runQuery(nationalId) : null;

  return (
    <>
      <PageHeader
        eyebrow="Plane A · exposure-v1"
        title="Ecosystem Exposure"
        lede="Ask every member whether this borrower owes them money right now. Screened locally against published Bloom filters first, so members who could not possibly hold them are never contacted — and never learn the query happened."
      />

      {!DEV ? (
        <Panel title="Unavailable">
          <Empty>This surface runs only in development</Empty>
        </Panel>
      ) : (
        <>
          <Panel title="Query" hint="acts as Micromart's node">
            <form method="GET" className="px-5 py-5 flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <label htmlFor="id" className="block font-mono text-[8px] uppercase tracking-[0.16em] text-white/35 mb-2">
                  National ID
                </label>
                <input
                  id="id"
                  name="id"
                  defaultValue={nationalId}
                  placeholder="39362808"
                  className="w-full bg-black/30 border border-white/[0.09] focus:border-emerald-500/40 rounded-lg px-3 py-2.5 font-mono text-sm text-white/85 placeholder:text-white/15 outline-none tracking-[0.08em]"
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300 transition-colors cursor-pointer"
              >
                Query
              </button>
            </form>
            <p className="px-5 pb-4 text-[11px] text-white/35 leading-relaxed">
              The ID is tokenised before it leaves this process. Nothing downstream — no
              member node, no log line, no audit row — ever sees the number you type.
            </p>
          </Panel>

          {outcome && "error" in outcome ? (
            <div className="mt-7 border border-red-500/30 bg-red-500/[0.07] rounded-xl px-5 py-4">
              <div className="inst text-[9px] text-red-300 mb-1.5">Query failed</div>
              <p className="text-[12px] text-white/70 font-mono">{outcome.error}</p>
            </div>
          ) : null}

          {outcome && "result" in outcome ? (
            <div className="mt-7 space-y-7">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/[0.07] border border-white/[0.07] rounded-xl overflow-hidden">
                {[
                  { v: String(outcome.result.activeLoans), l: "Active loans" },
                  { v: String(outcome.result.lenders), l: "Lenders" },
                  { v: outcome.result.outstandingBand, l: "Outstanding" },
                  { v: outcome.result.worstBucket.replace("_", " "), l: "Worst bucket" },
                  { v: String(outcome.result.velocity14d), l: "New credit, 14d" },
                ].map((s) => (
                  <div key={s.l} className="bg-[#070a09] px-4 py-4">
                    <div className="font-mono text-xl font-bold tabular-nums text-emerald-400 leading-none mb-2 truncate">
                      {s.v}
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/35">{s.l}</div>
                  </div>
                ))}
              </div>

              {outcome.result.velocity14d >= 2 ? (
                <div className="border border-amber-500/30 bg-amber-500/[0.06] rounded-xl px-5 py-4">
                  <div className="inst text-[9px] text-amber-300 mb-1.5">Stacking signal</div>
                  <p className="text-[12px] text-white/70 leading-relaxed">
                    This borrower took credit from {outcome.result.velocity14d} lenders in the last
                    fortnight. Totals alone would not separate them from someone holding the same
                    loans for a year — the velocity is the part a bureau cannot see.
                  </p>
                </div>
              ) : null}

              {outcome.result.partial ? (
                <div className="border border-red-500/30 bg-red-500/[0.07] rounded-xl px-5 py-4">
                  <div className="inst text-[9px] text-red-300 mb-1.5">Incomplete answer</div>
                  <p className="text-[12px] text-white/70">
                    Only {outcome.result.responded} of {outcome.result.queried} members answered in
                    time. Treat this as a floor, not a total.
                  </p>
                </div>
              ) : null}

              <Panel title="Coverage" hint="who was screened, who was asked">
                <div className="px-5 py-4 flex flex-wrap gap-6 text-[12px]">
                  {[
                    ["Screened", outcome.result.screened],
                    ["Contacted", outcome.result.queried],
                    ["Responded", outcome.result.responded],
                  ].map(([l, v]) => (
                    <div key={l as string}>
                      <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 mb-1">{l}</div>
                      <div className="font-mono tabular-nums text-white/80">{v as number}</div>
                    </div>
                  ))}
                  <div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 mb-1">Screened out</div>
                    <div className="font-mono tabular-nums text-emerald-400">
                      {outcome.result.screened - outcome.result.queried}
                      <span className="text-white/30 ml-2 text-[10px]">never contacted</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 mb-1">Timing</div>
                    <div className="font-mono tabular-nums text-white/80">
                      {outcome.result.timings.totalMs}ms
                      <span className="text-white/30 ml-2 text-[10px]">
                        screen {outcome.result.timings.screenMs} · fan-out {outcome.result.timings.fanoutMs}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/30 mb-1">Subject</div>
                    <div className="font-mono text-emerald-300/70">{tokenPreview(outcome.token)}</div>
                  </div>
                </div>
              </Panel>

              <Panel title="CRB 2.0 · report 20" hint="the envelope a member receives">
                <pre className="px-5 py-4 overflow-x-auto font-mono text-[10.5px] leading-relaxed text-white/60">
{JSON.stringify(ecosystemExposure(outcome.result), null, 2)}
                </pre>
              </Panel>
            </div>
          ) : null}

          {!nationalId ? (
            <div className="mt-7">
              <Panel title="Try one">
                <div className="px-5 py-4 text-[12px] text-white/55 leading-relaxed">
                  <code className="text-emerald-300/80">39362808</code> is seeded across four
                  members with recent disbursements.{" "}
                  <code className="text-emerald-300/80">99999999</code> is held by nobody — watch
                  the coverage panel show zero members contacted.
                </div>
              </Panel>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
