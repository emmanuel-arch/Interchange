"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER SEARCH — a CRB pull from the Interchange itself.
//
// Until 24 Oct 2026 a bureau report could only be pulled from inside a lender's
// Lending Console, on a borrower that console already held. This is the same
// pull from the Interchange, in the order the Lending Console's panel asks for
// things (connected-suite InterchangeBureauPanel):
//
//   1. find the customer — a phone number in this lender's own book, or an ID;
//   2. CONSENT FIRST — if none is on record, the same amber form: how it was
//      given, a note, the attestation under the operator's name;
//   3. the reports this lender can pull, each with what it costs;
//   4. a COST WARNING before anything is billed — and a held copy, still inside
//      retention, opens free and says so;
//   5. the document, opened in a viewer, on the lender's own letterhead.
//
// Live exposure (mode "exposure") is the same search and the same consent, then
// the ecosystem question instead of the bureau one.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import {
  AlertTriangle, Download, FileText, Loader2, Radar, Search, ShieldAlert, ShieldCheck, UserCheck, UserRound, X,
} from "lucide-react";

type Quote = { bureauCost: number; interchangeFee: number; total: number; tariffSource: string };
type Option = {
  type: number;
  name: string;
  answers: string;
  bureauReports: number[];
  quote: Quote | null;
  held: { pulledAt: string; expiresAt: string } | null;
};
type Consent = { ref: string; capturedAt: string; expiresAt: string; scopes: string[]; basis: string | null; note: string | null; recordedBy: string | null; via: string };
type Match = { nationalId: string; name: string | null; phone: string | null; accountNo: string | null; loans: number; openLoans: number };
type Lookup = {
  member: { code: string; name: string };
  query: { kind: "phone" | "id"; value: string };
  matches: Match[];
  choose?: boolean;
  message?: string;
  subject?: { nationalId: string; name: string | null; phone: string | null; accountNo: string | null; onBook: boolean; loans: number; openLoans: number; bookNote: string | null };
  consent?: Consent | null;
  pulls?: { id: string; reportType: number; name: string; pulledAt: string; billed: boolean; logSeq: string | null; servable: boolean }[];
  options?: Option[];
};
type Exposure = {
  result: {
    activeLoans: number; lenders: number; outstandingBand: string; worstBucket: string; newestDisbursement: string | null; velocity14d: number;
    partial: boolean; screened: number; queried: number; responded: number; subjectToken: string; timings: { totalMs: number; screenMs: number; fanoutMs: number };
  };
  silent: { memberCode: string; name: string; reason: string }[];
  receipt: { seq: string };
};

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const day = (s: string) =>
  new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

const BASES: [string, string][] = [
  ["loan-agreement", "In their signed loan agreement"],
  ["in-person", "In person, to me"],
  ["recorded-call", "On a recorded call"],
];

const card = "rounded-xl border border-white/[0.08] bg-[color:var(--tile)]";
const label = "font-mono text-[9px] uppercase tracking-[0.16em] text-white/45";

export default function CustomerSearch({
  mode,
  members,
  canPull,
  canCapture,
}: {
  mode: "bureau" | "exposure";
  /** Set only for a platform operator, who must say which member is asking. */
  members: { code: string; name: string }[] | null;
  canPull: boolean;
  canCapture: boolean;
}) {
  const [query, setQuery] = useState("");
  const [memberCode, setMemberCode] = useState(members?.[0]?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Lookup | null>(null);

  const [basis, setBasis] = useState("");
  const [note, setNote] = useState("");
  const [attest, setAttest] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState<Option | null>(null);
  const [pulling, setPulling] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{ url: string; title: string; billed: string | null } | null>(null);

  const [exposure, setExposure] = useState<Exposure | null>(null);
  const [checking, setChecking] = useState(false);

  const scoped = members ? { member_code: memberCode } : {};

  const lookup = async (nationalId?: string) => {
    setBusy(true);
    setError(null);
    setExposure(null);
    try {
      const res = await fetch("/api/console/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: nationalId ?? query, ...(nationalId ? { national_id: nationalId } : {}), ...scoped }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j) {
        setData(null);
        setError(j?.message ?? `The search could not be run (${res.status}).`);
        return;
      }
      setData(j as Lookup);
      setBasis("");
      setNote("");
      setAttest(false);
    } catch {
      setError("The search could not be run. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const recordConsent = async () => {
    if (!data?.subject) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/console/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ national_id: data.subject.nationalId, basis, note, attest, ...scoped }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? `Consent was not recorded (${res.status}).`);
        return;
      }
      setData({ ...data, consent: j.consent });
    } catch {
      setError("Consent was not recorded. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const pull = async (opt: Option) => {
    if (!data?.subject) return;
    setConfirm(null);
    setPulling(opt.type);
    setError(null);
    try {
      const res = await fetch("/api/console/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ national_id: data.subject.nationalId, report_type: opt.type, ...scoped }),
      });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("pdf")) {
        const j = await res.json().catch(() => null);
        setError(j?.message ?? `The report could not be produced (${res.status}).`);
        return;
      }
      const from = res.headers.get("x-interchange-served-from");
      const billed = Number(res.headers.get("x-interchange-billed-pulls") ?? "0");
      const url = URL.createObjectURL(await res.blob());
      setViewer({
        url,
        title: `${opt.name} · ${data.subject.name ?? `ID ${data.subject.nationalId}`}`,
        billed: from === "store" ? "Re-served from your stored copy — not billed again." : billed > 0 && opt.quote ? `Billed ${kes(opt.quote.total)} to ${data.member.name}.` : null,
      });
      void lookup(data.subject.nationalId);
    } catch {
      setError("The report could not be requested. Check the connection and try again.");
    } finally {
      setPulling(null);
    }
  };

  const checkExposure = async () => {
    if (!data?.subject) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/console/exposure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ national_id: data.subject.nationalId, ...scoped }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? `The exposure check could not be run (${res.status}).`);
        return;
      }
      setExposure(j as Exposure);
    } catch {
      setError("The exposure check could not be run. Check the connection and try again.");
    } finally {
      setChecking(false);
    }
  };

  const s = data?.subject;
  const consent = data?.consent ?? null;
  const exposureConsented = !!consent?.scopes.includes("ecosystem.exposure");

  return (
    <div className="space-y-6">
      {/* ── 1. Find the customer ─────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) void lookup();
        }}
        className={`${card} flex flex-wrap items-end gap-3 px-5 py-5`}
      >
        {members && (
          <div className="min-w-[200px]">
            <label htmlFor="member" className={`${label} mb-2 block`}>
              Asking for
            </label>
            <select
              id="member"
              value={memberCode}
              onChange={(e) => {
                setMemberCode(e.target.value);
                setData(null);
              }}
              className="w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 py-2.5 text-sm text-white/85 outline-none"
            >
              {members.map((m) => (
                <option key={m.code} value={m.code} className="bg-[color:var(--sheet-bg)]">
                  {m.name} · {m.code}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="min-w-[240px] flex-1">
          <label htmlFor="q" className={`${label} mb-2 block`}>
            Phone number or national ID
          </label>
          <input
            id="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="0712 345 678  ·  254712345678  ·  34635084"
            autoComplete="off"
            className="w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 py-2.5 font-mono text-sm tracking-[0.06em] text-white/85 outline-none placeholder:text-white/30 focus:border-cyan-500/50"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-semibold text-[#fff] transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
        </button>
        <p className="basis-full text-[11.5px] leading-relaxed text-white/50">
          A phone number is looked up in your own book only. The national ID goes to the bureau, which keys on it — it is
          tokenised here and never stored.
        </p>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-[13px] text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {data && !s && (
        <div className={`${card} px-5 py-4`}>
          {data.choose ? (
            <>
              <p className="mb-3 text-[13px] text-white/75">
                {data.matches.length} customers on {data.member.name}&apos;s book share this number. Which one?
              </p>
              <div className="space-y-2">
                {data.matches.map((m) => (
                  <button
                    key={m.nationalId}
                    type="button"
                    onClick={() => void lookup(m.nationalId)}
                    className="flex w-full items-center gap-3 rounded-lg border border-white/[0.08] px-3 py-2.5 text-left hover:bg-white/[0.04]"
                  >
                    <UserRound className="h-4 w-4 shrink-0 text-white/50" />
                    <span className="flex-1 text-[13px] text-white/85">{m.name ?? "Name not on record"}</span>
                    <span className="font-mono text-[11px] text-white/55">ID {m.nationalId}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-white/70">{data.message}</p>
          )}
        </div>
      )}

      {s && data && (
        <>
          {/* ── The customer ───────────────────────────────────────────── */}
          <div className={`${card} flex flex-wrap items-center gap-4 px-5 py-4`}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/60">
              <UserRound className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-white/90">{s.name ?? "Customer"}</p>
              <p className="mt-0.5 font-mono text-[12px] text-white/60">
                {[s.phone, `ID ${s.nationalId}`, s.accountNo ? `A/C ${s.accountNo}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                s.onBook ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/[0.12] bg-white/[0.04] text-white/60"
              }`}
            >
              {s.onBook
                ? `On ${data.member.name}'s book · ${s.loans} loan${s.loans === 1 ? "" : "s"}${s.openLoans ? `, ${s.openLoans} open` : ""}`
                : `Not on ${data.member.name}'s book`}
            </span>
          </div>

          {/* ── 2. Consent ────────────────────────────────────────────── */}
          {consent ? (
            <p className="flex items-start gap-2 text-[12.5px] text-white/70">
              <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                Credit check authorised {day(consent.capturedAt)}
                {consent.basis ? ` — ${consent.basis}` : ""}
                {consent.recordedBy ? `, recorded by ${consent.recordedBy}` : ""}. Valid to {day(consent.expiresAt).slice(0, 11)}.
              </span>
            </p>
          ) : (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-4">
              <p className="text-[14px] font-semibold text-amber-300">No credit-check consent on record</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-amber-200/90">
                A bureau report may only be requested with the customer&apos;s authorisation. Record how they gave it.
              </p>
              {canCapture ? (
                <>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                    <select
                      value={basis}
                      onChange={(e) => setBasis(e.target.value)}
                      className="rounded-lg border border-amber-500/30 bg-[#fff] px-2.5 py-2 text-[12.5px] text-[#0c0c10]"
                    >
                      <option value="">How was consent given?</option>
                      {BASES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Note (agreement no., call ref…)"
                      className="rounded-lg border border-amber-500/30 bg-[#fff] px-2.5 py-2 text-[12.5px] text-[#0c0c10] placeholder:text-[#8a8a95]"
                    />
                  </div>
                  <label className="mt-2.5 flex items-start gap-2 text-[12.5px] text-amber-200/90">
                    <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5" />
                    I confirm this customer has authorised a credit reference check, and I am recording it under my name.
                  </label>
                  <button
                    type="button"
                    onClick={recordConsent}
                    disabled={!basis || !attest || saving}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-700 px-3.5 py-2 text-[12.5px] font-semibold text-[#fff] disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Record consent
                  </button>
                </>
              ) : (
                <p className="mt-2 text-[12px] text-amber-200/80">Your access does not include recording consent. Ask your administrator.</p>
              )}
            </div>
          )}

          {/* ── 3–5. The bureau ───────────────────────────────────────── */}
          {mode === "bureau" && (
            <section className={`${card} px-5 py-5`}>
              <h2 className="text-[15px] font-semibold text-white/90">Credit bureau — through the Interchange</h2>
              <p className="mt-0.5 text-[12.5px] text-white/55">
                Metropol files {data.member.name} has pulled for this customer, from the Lending Console or from here, newest first.
              </p>

              {(data.pulls ?? []).length === 0 ? (
                <p className="mt-3 text-[13px] text-white/60">No bureau report has been requested through the Interchange for this customer yet.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {data.pulls!.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2 text-[12.5px]">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span className="flex-1 text-white/80">
                        {p.name} (report {p.reportType}) · {day(p.pulledAt)}
                      </span>
                      <span className="text-[11px] text-white/45">{p.billed ? "billed" : "not billed"}</span>
                      {p.logSeq && <span className="font-mono text-[11px] text-white/45">log #{p.logSeq}</span>}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {(data.options ?? []).map((o) => (
                  <div key={o.type} className="flex flex-col rounded-xl border border-white/[0.09] bg-white/[0.02] p-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">Report {o.type}</p>
                    <p className="mt-1 text-[14px] font-semibold text-white/90">{o.name}</p>
                    <p className="mt-1 flex-1 text-[12px] leading-relaxed text-white/60">{o.answers}</p>
                    <p className="mt-3 text-[12px] text-white/70">
                      {o.held ? (
                        <span className="text-emerald-300">Held from {day(o.held.pulledAt)} — opens free</span>
                      ) : o.quote ? (
                        <>
                          <span className="font-semibold text-white/90">{kes(o.quote.total)}</span> per pull
                        </>
                      ) : null}
                    </p>
                    <button
                      type="button"
                      disabled={!consent || !canPull || pulling !== null}
                      onClick={() => (o.held ? void pull(o) : setConfirm(o))}
                      className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold text-[#fff] disabled:opacity-45"
                      style={{ backgroundColor: "var(--accent)" }}
                    >
                      {pulling === o.type ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      {pulling === o.type ? "Requesting…" : o.held ? "Open report" : "Request report"}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-white/45">
                Billed per pull to {data.member.name} and metered on the Usage page. Refused unless the customer has consented to a credit check.
              </p>
            </section>
          )}

          {/* ── Live exposure ─────────────────────────────────────────── */}
          <section className={`${card} px-5 py-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-white/90">Ecosystem exposure — live</h2>
                <p className="mt-0.5 text-[12.5px] text-white/55">
                  Does this customer owe other members right now? Free at the point of use; logged like every query.
                </p>
              </div>
              <button
                type="button"
                onClick={checkExposure}
                disabled={!exposureConsented || checking}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-[12.5px] font-semibold text-cyan-300 disabled:opacity-45"
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />} Check live exposure
              </button>
            </div>
            {!exposureConsented && (
              <p className="mt-2 text-[11.5px] text-white/50">
                Needs a consent covering the ecosystem check — record the credit-check consent above.
              </p>
            )}
            {exposure && <ExposureView e={exposure} memberName={data.member.name} />}
          </section>
        </>
      )}

      {/* ── 4. The cost warning ─────────────────────────────────────────── */}
      {confirm && data?.subject && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] grid place-items-center bg-[#000]/50 p-4 backdrop-blur-sm">
          <div className="sheet w-full max-w-md rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[16px] font-semibold text-[color:var(--ink)]">This pull will be billed</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
                  {confirm.name} (report {confirm.type}) for {data.subject.name ?? `ID ${data.subject.nationalId}`}, charged to{" "}
                  <span className="font-semibold text-[color:var(--ink)]">{data.member.name}</span>.
                </p>
              </div>
            </div>
            {confirm.quote && (
              <dl className="mt-4 space-y-1.5 rounded-xl border border-[color:var(--ink)]/10 px-4 py-3 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-[color:var(--ink-muted)]">Metropol report{confirm.bureauReports.length > 1 ? `s ${confirm.bureauReports.join(", ")}` : ` ${confirm.bureauReports[0]}`}</dt>
                  <dd className="tabular-nums text-[color:var(--ink)]">{kes(confirm.quote.bureauCost)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[color:var(--ink-muted)]">Interchange fee</dt>
                  <dd className="tabular-nums text-[color:var(--ink)]">{kes(confirm.quote.interchangeFee)}</dd>
                </div>
                <div className="flex justify-between border-t border-[color:var(--ink)]/10 pt-1.5 font-semibold">
                  <dt className="text-[color:var(--ink)]">This pull</dt>
                  <dd className="tabular-nums text-[color:var(--ink)]">{kes(confirm.quote.total)}</dd>
                </div>
              </dl>
            )}
            <p className="mt-3 text-[11.5px] leading-relaxed text-[color:var(--ink-faint)]">
              Net of excise and VAT, on the contract holder&apos;s rate card. It is added to this month&apos;s bill on the Usage page the moment the
              bureau answers. A thin file the bureau charges for is still billed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="rounded-lg border border-[color:var(--ink)]/15 px-4 py-2 text-[13px] font-medium text-[color:var(--ink-muted)]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void pull(confirm)}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-[#fff]"
                style={{ backgroundColor: "var(--accent)" }}
              >
                Continue — pull and bill {confirm.quote ? kes(confirm.quote.total) : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. The document ─────────────────────────────────────────────── */}
      {viewer && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex flex-col bg-[#000]/70 p-3 backdrop-blur-sm sm:p-6">
          <div className="sheet mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl">
            <div className="flex items-center gap-3 border-b border-[color:var(--ink)]/10 px-4 py-3">
              <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-[color:var(--ink)]">{viewer.title}</p>
                {viewer.billed && <p className="text-[11.5px] text-[color:var(--ink-muted)]">{viewer.billed}</p>}
              </div>
              <a href={viewer.url} download="interchange-report.pdf" className="rounded-lg p-2 text-[color:var(--ink-muted)] hover:bg-[color:var(--ink)]/[0.06]" title="Download">
                <Download className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(viewer.url);
                  setViewer(null);
                }}
                className="rounded-lg p-2 text-[color:var(--ink-muted)] hover:bg-[color:var(--ink)]/[0.06]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe src={viewer.url} title={viewer.title} className="min-h-0 flex-1 bg-[#fff]" />
          </div>
        </div>
      )}
    </div>
  );
}

const BUCKET: Record<string, string> = {
  prepayment: "Paying ahead", due: "Current", watch_1: "1–30 days late", watch_2: "31–60 days late", watch_3: "61–90 days late", npl: "Over 90 days — non-performing",
};

function ExposureView({ e, memberName }: { e: Exposure; memberName: string }) {
  const r = e.result;
  const unpublished = e.silent.filter((s) => s.reason === "unpublished");
  const failed = e.silent.filter((s) => s.reason !== "unpublished");
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08] md:grid-cols-5">
        {[
          { v: String(r.lenders), l: "Other lenders" },
          { v: String(r.activeLoans), l: "Active loans elsewhere" },
          { v: r.outstandingBand === "none" ? "None" : `KES ${r.outstandingBand}`, l: "Outstanding (banded)" },
          { v: r.lenders ? BUCKET[r.worstBucket] ?? r.worstBucket : "—", l: "Worst status" },
          { v: String(r.velocity14d), l: "New credit, 14 days" },
        ].map((x) => (
          <div key={x.l} className="bg-[color:var(--tile)] px-4 py-3.5">
            <div className={`mb-1.5 truncate text-[17px] font-bold tabular-nums ${r.lenders > 0 ? "text-amber-300" : "text-emerald-300"}`}>{x.v}</div>
            <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/50">{x.l}</div>
          </div>
        ))}
      </div>
      <p className="text-[12.5px] leading-relaxed text-white/70">
        {r.lenders > 0
          ? `This customer is servicing ${r.activeLoans} loan${r.activeLoans === 1 ? "" : "s"} with ${r.lenders} other member${r.lenders === 1 ? "" : "s"} of the network right now — outside ${memberName}'s own books.`
          : `No other member reports a loan to this customer right now.`}{" "}
        Amounts are banded and lenders are not named: that is all the network discloses without the customer&apos;s identity.disclose consent.
      </p>
      {r.velocity14d >= 2 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[12px] text-amber-300">
          Stacking signal: credit from {r.velocity14d} lenders in the last fortnight.
        </p>
      )}
      <p className="text-[11.5px] text-white/50">
        Screened {r.screened} member{r.screened === 1 ? "" : "s"}, asked {r.queried} (the rest were ruled out by their published filters and never
        learned of this query), {r.responded} answered · {r.timings.totalMs} ms · log #{e.receipt.seq}
        {unpublished.length > 0 && ` · not yet publishing a book: ${unpublished.map((s) => s.name).join(", ")}`}
        {failed.length > 0 && ` · did not answer: ${failed.map((s) => s.name).join(", ")} — treat this as a floor`}.
      </p>
    </div>
  );
}
