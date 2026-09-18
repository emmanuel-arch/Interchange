"use client";

import { useMemo, useState } from "react";
import { Pill } from "@/components/chrome";
import {
  DRIVER_LABEL, INCOME_BASIS_LABEL, METHOD_LABEL, MONTHS_BASIS_LABEL,
  type CrunchPolicy, type IncomeBasis, type MonthsBasis, type AffordabilityMethod, type ScoreDriverKey,
} from "@/lib/statement/policy";

/**
 * The settings form.
 *
 * ── WHY EVERY CONTROL CARRIES ITS CONSEQUENCE ────────────────────────────────
 * A form of twenty numbers with terse labels is a form that gets set once, by
 * whoever happened to be in the room, and never revisited. So each control says
 * what it does to the answer in the same words the report uses — the strings
 * come from the same label maps the PDF prints from, so the screen and the
 * document can never drift apart.
 *
 * ── AND WHY THE WEIGHTS ARE SLIDERS ─────────────────────────────────────────
 * A score weight is a RELATIVE judgement: "betting matters more to me than
 * savings" is the real decision, and the absolute number is an implementation
 * detail. Sliders side by side make the comparison the thing you look at.
 */
export function PolicyForm({
  initial,
  fallback,
  writable,
  memberCode,
}: {
  initial: CrunchPolicy;
  fallback: CrunchPolicy;
  writable: boolean;
  memberCode: string;
}) {
  const [p, setP] = useState<CrunchPolicy>(initial);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "ok" | "error"; message?: string; adjusted?: string[] }>({ kind: "idle" });

  const dirty = useMemo(() => JSON.stringify(p) !== JSON.stringify(initial), [p, initial]);

  const set = <K extends keyof CrunchPolicy>(key: K, value: CrunchPolicy[K]) => setP((prev) => ({ ...prev, [key]: value }));
  const setIncome = (patch: Partial<CrunchPolicy["income"]>) => set("income", { ...p.income, ...patch });
  const setAff = (patch: Partial<CrunchPolicy["affordability"]>) => set("affordability", { ...p.affordability, ...patch });
  const setThresh = (patch: Partial<CrunchPolicy["thresholds"]>) => set("thresholds", { ...p.thresholds, ...patch });
  const setDriver = (key: ScoreDriverKey, patch: Partial<CrunchPolicy["score"]["drivers"][ScoreDriverKey]>) =>
    set("score", { ...p.score, drivers: { ...p.score.drivers, [key]: { ...p.score.drivers[key], ...patch } } });

  async function save() {
    setState({ kind: "saving" });
    try {
      const res = await fetch(`/api/policy?member=${encodeURIComponent(memberCode)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      const json = await res.json();
      if (!res.ok || !json.saved) {
        setState({ kind: "error", message: json.problem ?? json.error ?? "The settings could not be saved.", adjusted: json.adjusted });
        return;
      }
      setP(json.policy);
      setState({ kind: "ok", message: "Saved. Every report produced from now on uses these settings and prints them.", adjusted: json.adjusted });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "The settings could not be saved." });
    }
  }

  const disabled = !writable || state.kind === "saving";

  return (
    <div className="space-y-6">
      <Section
        title="What counts as income"
        hint="the denominator under every monthly figure"
        note="This one choice moves the headline by a factor of two on a trader's statement. The report prints which basis was used and shows the others beside it, so an officer can always see what the alternative would have said."
      >
        <Field label="Income basis">
          <div className="grid gap-2">
            {(Object.keys(INCOME_BASIS_LABEL) as IncomeBasis[]).map((k) => (
              <Choice
                key={k}
                name="basis"
                checked={p.income.basis === k}
                disabled={disabled}
                onChange={() => setIncome({ basis: k })}
                title={INCOME_BASIS_LABEL[k].title}
                detail={INCOME_BASIS_LABEL[k].detail}
              />
            ))}
          </div>
        </Field>

        <Field label="Months to divide by">
          <div className="grid gap-2">
            {(Object.keys(MONTHS_BASIS_LABEL) as MonthsBasis[]).map((k) => (
              <Choice
                key={k}
                name="months"
                checked={p.income.monthsBasis === k}
                disabled={disabled}
                onChange={() => setIncome({ monthsBasis: k })}
                title={MONTHS_BASIS_LABEL[k].title}
                detail={MONTHS_BASIS_LABEL[k].detail}
              />
            ))}
          </div>
        </Field>

        <Toggle
          checked={p.income.excludeSelfTransfers}
          disabled={disabled}
          onChange={(v) => setIncome({ excludeSelfTransfers: v })}
          title="Exclude own-account transfers"
          detail="The holder moving takings from their own till into this wallet. Counting them would count the sale twice."
        />
        <Toggle
          checked={p.income.excludeReversals}
          disabled={disabled}
          onChange={(v) => setIncome({ excludeReversals: v })}
          title="Exclude reversals"
          detail="Money returned because it should not have left. It was never income."
        />
        <Toggle
          checked={p.income.countBankBulkAsIncome}
          disabled={disabled}
          onChange={(v) => setIncome({ countBankBulkAsIncome: v })}
          title="Count bank bulk credits as income"
          detail="A bank's bulk shortcode carries payroll, supplier settlement and loans through one pipe. Off, these get their own line and are counted as neither. Turn it on only if you know your segment is salaried."
        />
      </Section>

      <Section
        title="What they can afford"
        hint="how the comfortable instalment is reached"
        note="The report shows both routes side by side and every step of the arithmetic, whichever method is chosen here."
      >
        <Field label="Method">
          <div className="grid gap-2">
            {(Object.keys(METHOD_LABEL) as AffordabilityMethod[]).map((k) => (
              <Choice
                key={k}
                name="method"
                checked={p.affordability.method === k}
                disabled={disabled}
                onChange={() => setAff({ method: k })}
                title={METHOD_LABEL[k].title}
                detail={METHOD_LABEL[k].detail}
              />
            ))}
          </div>
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Slider
            label="Debt service cap"
            value={Math.round(p.affordability.dsrCap * 100)}
            min={5}
            max={90}
            step={1}
            suffix="% of income"
            disabled={disabled}
            onChange={(v) => setAff({ dsrCap: v / 100 })}
            detail="The most this member will ever see going to debt, including what the borrower already pays elsewhere."
          />
          <Slider
            label="Share of surplus"
            value={Math.round(p.affordability.surplusShare * 100)}
            min={5}
            max={100}
            step={1}
            suffix="% of what is left"
            disabled={disabled}
            onChange={(v) => setAff({ surplusShare: v / 100 })}
            detail="How much of the money actually left over each month a new instalment may take."
          />
          <NumberField
            label="Instalment floor"
            value={p.affordability.floorKes}
            disabled={disabled}
            onChange={(v) => setAff({ floorKes: v })}
            detail="Below this the report says 'nothing' rather than quoting a figure too small to lend."
          />
          <NumberField
            label="Rounding step"
            value={p.affordability.roundToKes}
            disabled={disabled}
            onChange={(v) => setAff({ roundToKes: v })}
            detail="The ceiling is rounded down to this, so the figure reads like a product rather than a calculation."
          />
        </div>

        <Toggle
          checked={p.affordability.deductExistingCommitments}
          disabled={disabled}
          onChange={(v) => setAff({ deductExistingCommitments: v })}
          title="Deduct existing commitments"
          detail="Subtract instalments already going to other credit providers, read from the statement. Off means the ceiling is gross and your officer nets it themselves."
        />
        <Toggle
          checked={p.affordability.countBankTransfersAsSpend}
          disabled={disabled}
          onChange={(v) => setAff({ countBankTransfersAsSpend: v })}
          title="Count bank transfers as spending"
          detail="Money sent to a bank or SACCO account. Off, it is not treated as consumed — it is still the customer's money and still available to service a loan."
        />
      </Section>

      <Section
        title="What moves the score"
        hint="twelve drivers, your weights"
        note="Each weight is the most that driver may move the score in either direction. The report draws every driver against its own track, so a reader can tell 'this factor is exhausted' from 'this factor barely registered'."
      >
        <div className="grid gap-3">
          {(Object.keys(DRIVER_LABEL) as ScoreDriverKey[]).map((k) => {
            const d = p.score.drivers[k];
            const def = fallback.score.drivers[k];
            return (
              <div key={k} className="rounded-lg border border-white/[0.07] bg-white/[0.015] px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium text-white/85">{DRIVER_LABEL[k].title}</span>
                      <Pill tone={driverTone(DRIVER_LABEL[k].direction)}>
                        {DRIVER_LABEL[k].direction === "signed" ? "up or down" : DRIVER_LABEL[k].direction}
                      </Pill>
                    </div>
                    <p className="mt-0.5 text-[12px] text-white/45 leading-relaxed">{DRIVER_LABEL[k].detail}</p>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-[11px] text-white/45">
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      disabled={disabled}
                      onChange={(e) => setDriver(k, { enabled: e.target.checked })}
                      className="h-3.5 w-3.5 accent-emerald-500"
                    />
                    scored
                  </label>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={150}
                    step={5}
                    value={d.weight}
                    disabled={disabled || !d.enabled}
                    onChange={(e) => setDriver(k, { weight: Number(e.target.value) })}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-emerald-500 disabled:opacity-40"
                  />
                  <span className="w-20 shrink-0 text-right font-mono text-[13px] tabular-nums text-white/80">
                    {d.enabled ? `±${d.weight}` : "off"}
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/30">
                    was {def.weight}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Thresholds" hint="when a driver starts to bite">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Slider label="Betting share of outflow" value={Math.round(p.thresholds.gamblingWatch * 100)} min={0} max={50} step={1} suffix="%" disabled={disabled} onChange={(v) => setThresh({ gamblingWatch: v / 100 })} detail="Above this, betting costs points." />
          <Slider label="Borrowed share of money in" value={Math.round(p.thresholds.loanDependencyWatch * 100)} min={0} max={80} step={1} suffix="%" disabled={disabled} onChange={(v) => setThresh({ loanDependencyWatch: v / 100 })} detail="Above this, loan dependency costs points." />
          <NumberField label="Lenders before it counts against" value={p.thresholds.lenderCountWatch} disabled={disabled} onChange={(v) => setThresh({ lenderCountWatch: v })} detail="How many credit providers a borrower may service before the count itself is adverse." />
          <NumberField label="Fuliza draw-downs allowed" value={p.thresholds.fulizaEvents} disabled={disabled} onChange={(v) => setThresh({ fulizaEvents: v })} detail="Overdraft events in the period before reliance is flagged." />
          <NumberField label="Stable income volatility" value={p.thresholds.volatilityStable} step={0.05} disabled={disabled} onChange={(v) => setThresh({ volatilityStable: v })} detail="Coefficient of variation at or below which income counts as stable." />
          <NumberField label="Erratic income volatility" value={p.thresholds.volatilityErratic} step={0.05} disabled={disabled} onChange={(v) => setThresh({ volatilityErratic: v })} detail="At or above which it counts as erratic." />
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#070a09]/95 px-5 py-4 backdrop-blur">
        <div className="min-w-0 text-[12.5px]">
          {state.kind === "ok" ? <span className="text-emerald-300">{state.message}</span>
            : state.kind === "error" ? <span className="text-red-300">{state.message}</span>
            : dirty ? <span className="text-amber-200/90">Unsaved changes. Reports still use the stored settings until you save.</span>
            : <span className="text-white/40">Saved settings. Every report prints these on its method page.</span>}
          {state.adjusted?.length ? (
            <ul className="mt-1 space-y-0.5 text-[11.5px] text-amber-200/70">
              {state.adjusted.map((a) => <li key={a}>· {a}</li>)}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { setP(initial); setState({ kind: "idle" }); }}
            disabled={disabled || !dirty}
            className="rounded-lg border border-white/12 px-4 py-2 text-[13px] text-white/60 hover:bg-white/[0.04] disabled:opacity-35"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => { setP({ ...fallback, memberCode: p.memberCode, label: p.label }); }}
            disabled={disabled}
            className="rounded-lg border border-white/12 px-4 py-2 text-[13px] text-white/60 hover:bg-white/[0.04] disabled:opacity-35"
          >
            Reset to Interchange default
          </button>
          <button
            type="button"
            onClick={save}
            disabled={disabled || !dirty}
            className="rounded-lg border border-emerald-500/45 bg-emerald-500/15 px-5 py-2 text-[13px] font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-35"
          >
            {state.kind === "saving" ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The console chrome names its tones ok/pending/bad, not good/watch/bad. */
function driverTone(d: "positive" | "negative" | "signed") {
  return d === "negative" ? "bad" : d === "positive" ? "ok" : "mute";
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Section({ title, hint, note, children }: { title: string; hint?: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.012]">
      <header className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] px-5 py-3">
        <h2 className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">{title}</h2>
        {hint ? <span className="font-mono text-[9px] text-white/25">{hint}</span> : null}
      </header>
      <div className="space-y-5 px-5 py-5">
        {note ? <p className="text-[12.5px] leading-relaxed text-white/45">{note}</p> : null}
        {children}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">{label}</div>
      {children}
    </div>
  );
}

function Choice({ name, checked, disabled, onChange, title, detail }: { name: string; checked: boolean; disabled: boolean; onChange: () => void; title: string; detail: string }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-lg border px-4 py-2.5 transition ${checked ? "border-emerald-500/40 bg-emerald-500/[0.07]" : "border-white/[0.07] bg-white/[0.015] hover:border-white/15"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="mt-1 h-3.5 w-3.5 shrink-0 accent-emerald-500" />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-white/85">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-white/45">{detail}</span>
      </span>
    </label>
  );
}

function Toggle({ checked, disabled, onChange, title, detail }: { checked: boolean; disabled: boolean; onChange: (v: boolean) => void; title: string; detail: string }) {
  return (
    <label className={`flex gap-3 rounded-lg border border-white/[0.07] bg-white/[0.015] px-4 py-2.5 ${disabled ? "opacity-60" : "cursor-pointer hover:border-white/15"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-3.5 w-3.5 shrink-0 accent-emerald-500" />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-white/85">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-white/45">{detail}</span>
      </span>
    </label>
  );
}

function Slider({ label, value, min, max, step, suffix, disabled, onChange, detail }: { label: string; value: number; min: number; max: number; step: number; suffix: string; disabled: boolean; onChange: (v: number) => void; detail: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-white/80">{label}</span>
        <span className="font-mono text-[14px] tabular-nums text-emerald-300">{value}<span className="ml-1 text-[10px] text-white/35">{suffix}</span></span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="mt-2.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-emerald-500 disabled:opacity-40" />
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/40">{detail}</p>
    </div>
  );
}

function NumberField({ label, value, step = 1, disabled, onChange, detail }: { label: string; value: number; step?: number; disabled: boolean; onChange: (v: number) => void; detail: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-white/80">{label}</span>
        <input
          type="number"
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 rounded-md border border-white/12 bg-black/30 px-2.5 py-1 text-right font-mono text-[13px] tabular-nums text-emerald-300 outline-none focus:border-emerald-500/50 disabled:opacity-40"
        />
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/40">{detail}</p>
    </div>
  );
}
