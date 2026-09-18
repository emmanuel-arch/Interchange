import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, ShieldCheck, Fingerprint, Link2, ScrollText, Scale, Network, FileDown, Braces, Sheet, FileText } from "lucide-react";
import { NetworkField } from "@/components/site/NetworkField";
import { FlipCard } from "@/components/site/FlipCard";
import { Reveal } from "@/components/site/Reveal";
import { ExposureRadar } from "@/components/site/ExposureRadar";
import { REPORTS, type InterchangeReport } from "@/lib/reports/catalogue";
import { BUREAU_REPORT_TYPES } from "@/lib/codes/metropol";
import { FACTS, FACTS_AS_AT } from "@/lib/site/facts";
import { previewByType } from "@/lib/preview/manifest";

export const metadata: Metadata = {
  title: "The Interchange — one signed question, every lender's answer",
  description:
    "A consent-gated exchange for Kenyan lenders: live cross-lender exposure, bureau reports read as decisions, and M-PESA statement crunching, in one signed API.",
};

const SOURCE_LABEL: Record<InterchangeReport["source"], string> = {
  ecosystem: "Member books",
  bureau: "Metropol CRB",
  hybrid: "Books + bureau",
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-2xl font-semibold tabular-nums text-white sm:text-3xl">{value}</div>
      <div className="mt-1 text-[12px] leading-snug text-white/45">{label}</div>
    </div>
  );
}

function SectionHead({ eyebrow, title, lede, id }: { eyebrow: string; title: string; lede?: string; id?: string }) {
  return (
    <Reveal>
      <div id={id} className="scroll-mt-24">
        <div className="inst text-[10px] text-emerald-400/80">{eyebrow}</div>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-[42px]">{title}</h2>
        {lede ? <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/55 sm:text-base">{lede}</p> : null}
      </div>
    </Reveal>
  );
}

export default function Landing() {
  const credit = previewByType(12);
  const products = REPORTS.slice().sort((a, b) => Number(b.live) - Number(a.live) || a.type - b.type);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <NetworkField className="absolute inset-0 h-full w-full opacity-90" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#040605] via-[#040605]/85 to-transparent lg:via-[#040605]/60" />
        <div className="relative mx-auto max-w-[1240px] px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:pb-28 lg:pt-32">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-emerald-200/90">Live on real member books</span>
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-6 max-w-[15ch] text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-[76px]">
              <span className="text-gradient">One signed question.</span>
              <br />
              Every lender&apos;s answer.
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg">
              Learn, in one consented call, whether a borrower who looks clean to you is already servicing loans across the
              ecosystem. Then read the bureau file, the M-PESA statement and the score as one decision you can defend.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/preview" className="group inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-3.5 text-[15px] font-semibold text-[#03140d] transition hover:bg-emerald-400">
                See what a live request returns
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/docs" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3.5 text-[15px] text-white/85 transition hover:border-white/30 hover:bg-white/[0.04]">
                Read the API
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="mt-16 grid max-w-3xl grid-cols-2 gap-6 border-t border-white/[0.08] pt-8 sm:grid-cols-4">
              <Stat value={FACTS.positionsPublished.toLocaleString("en-KE")} label="borrower positions published, tokenised" />
              <Stat value={FACTS.borrowersAtTwoOrMore.toLocaleString("en-KE")} label="borrowers servicing loans at two or more lenders" />
              <Stat value={String(FACTS.bureauReportTypesEntitled)} label="bureau report types, packaged" />
              <Stat value="0" label="raw national IDs stored by the Registry" />
            </div>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/25">Measured on live books · {FACTS_AS_AT}</p>
          </Reveal>
        </div>
      </section>

      {/* ── Products ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-4 pt-20 sm:px-6">
        <SectionHead
          id="products"
          eyebrow="What a lender can ask"
          title="Every report answers one question a credit officer actually asks."
          lede="Turn a card for where the answer comes from and what it returns. Ecosystem answers are free to a contributing member; bureau-backed answers carry the bureau's cost and a stated fee."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((r, i) => (
            <Reveal key={r.code} delay={Math.min(i * 0.04, 0.3)}>
              <FlipCard
                label={r.name}
                className="h-[248px] cursor-pointer select-none"
                front={
                  <div className="glass flex h-full flex-col justify-between rounded-2xl p-6">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/35">Report {r.type}</span>
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${r.live ? "border-emerald-500/30 text-emerald-300" : "border-white/10 text-white/35"}`}>
                        {r.live ? "Live" : "Specified"}
                      </span>
                    </div>
                    <div>
                      <p className="text-[21px] font-medium leading-snug text-white/90">&ldquo;{r.answers}&rdquo;</p>
                      <p className="mt-3 text-[13px] text-white/40">{r.name}</p>
                    </div>
                  </div>
                }
                back={
                  <div className="flex h-full flex-col justify-between rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.02] p-6">
                    <div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">{SOURCE_LABEL[r.source]}</div>
                      <p className="mt-3 text-[14px] leading-relaxed text-white/75">{r.edge ?? "Answered from the ecosystem's live books."}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {["PDF", "JSON", "HTML"].map((f) => (
                        <span key={f} className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/55">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                }
              />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Bureau Direct ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-4 pt-28 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <SectionHead
              id="bureau"
              eyebrow="Bureau Direct"
              title="The bureau's data, read as a decision."
              lede={`All ${BUREAU_REPORT_TYPES.filter((r) => r.entitled).length} Metropol report types, pulled through one signed call. The bureau's JSON is a list of codes; we hand back the same answer three ways, with the regulatory notices exactly where the bureau puts them.`}
            />
            <Reveal delay={0.1}>
              <ul className="mt-8 space-y-3">
                {[
                  { icon: FileText, t: "A PDF on the Interchange letterhead", d: "Totals, concentration, staleness and stacking velocity, with every panel saying whose figure it is." },
                  { icon: Braces, t: "JSON with every code in words", d: "Delinquency, product type, account status and sector carried as value and meaning." },
                  { icon: FileDown, t: "The bureau's response, unchanged", d: "Kept byte for byte beside its SHA-256, so a dispute starts from what the bureau actually said." },
                  { icon: Sheet, t: "The account ladder as CSV", d: "Every account, one row, ready for a spreadsheet or a model." },
                ].map(({ icon: Icon, t, d }) => (
                  <li key={t} className="flex gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    <div>
                      <div className="text-[15px] font-medium text-white/90">{t}</div>
                      <div className="mt-1 text-[13px] leading-relaxed text-white/50">{d}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <Link href="/preview/12" className="group relative block">
              <div className="absolute -inset-6 rounded-[32px] bg-emerald-500/10 blur-3xl transition-opacity group-hover:opacity-100" />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl shadow-black/60 transition-transform duration-500 group-hover:-translate-y-1 [transform:perspective(1600px)_rotateY(-6deg)] group-hover:[transform:perspective(1600px)_rotateY(0deg)]">
                {credit?.files?.thumb ? (
                  <Image src={credit.files.thumb.path} alt="Page one of a sample Full Enhanced Credit Info report" width={794} height={1123} className="h-auto w-full" priority={false} />
                ) : (
                  <div className="aspect-[794/1123]" />
                )}
              </div>
              <div className="relative mt-4 flex items-center justify-between text-[13px] text-white/55">
                <span>Sample report 12 · anonymised from a real response</span>
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── Exposure ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-4 pt-28 sm:px-6">
        <SectionHead
          id="exposure"
          eyebrow="Live exposure"
          title="The borrower who looks clean to you."
          lede={`${FACTS.borrowersAtTwoOrMore.toLocaleString("en-KE")} borrowers on published books are servicing loans at more than one lender. A bureau learns that a month later. The Interchange answers now, from live books, without anyone seeing a national ID.`}
        />
        <Reveal delay={0.1}>
          <div className="glass mt-10 rounded-3xl p-6 sm:p-10">
            <ExposureRadar />
          </div>
        </Reveal>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {[
            { n: "01", t: "Tokenised at your edge", d: "The ID becomes a token inside your own node. The Registry never sees it." },
            { n: "02", t: "Screened locally", d: "Published filters rule out members who cannot hold the borrower. They never learn you asked." },
            { n: "03", t: "Fanned out in parallel", d: "The rest answer with aggregates: counts, a band, a bucket. No names, no loan IDs." },
            { n: "04", t: "Signed and logged", d: "Every call, granted or refused, lands in a hash-chained log anyone can re-verify." },
          ].map((s, i) => (
            <Reveal key={s.n} delay={0.05 * i}>
              <div className="h-full rounded-2xl border border-white/[0.07] p-5">
                <div className="font-mono text-[12px] text-emerald-400/80">{s.n}</div>
                <div className="mt-3 text-[15px] font-medium text-white/90">{s.t}</div>
                <p className="mt-2 text-[13px] leading-relaxed text-white/50">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Crunch ───────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-4 pt-28 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/mpesa/mpesa-background.jpg')" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/40" />
          <div className="relative grid gap-10 p-6 sm:p-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div id="crunch" className="scroll-mt-24">
              <div className="inst text-[10px] text-[#4CB749]">Statement Crunch</div>
              <h2 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight sm:text-[42px]">A locked M-PESA PDF in. An affordability decision out.</h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/65">
                Upload the statement Safaricom emailed and the password from their SMS. Watch it decrypt, parse, post to
                ledgers, audit and score, then download the result. Crunch one, or a queue of them. The PDF and its password
                are never stored.
              </p>
              <Link href="/preview/crunch" className="group mt-8 inline-flex items-center gap-2 rounded-full bg-[#4CB749] px-6 py-3.5 text-[15px] font-semibold text-[#062b0c] transition hover:brightness-110">
                Watch the theatre
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <ol className="space-y-2.5">
              {["Decrypt the statement", "Parse every transaction", "Extract income and spend", "Post to ledgers", "Audit for gambling and other lenders", "Score and size the instalment"].map((s, i) => (
                <li key={s} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#4CB749]/60 font-mono text-[11px] text-[#9fe39c]">{i + 1}</span>
                  <span className="text-[14px] text-white/85">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── Trust ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-4 pt-28 sm:px-6">
        <SectionHead
          eyebrow="Why competitors can share a room"
          title="Security that is enforced in code, not promised in a contract."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Fingerprint, t: "Identity destroyed at the edge", d: "National IDs and phone numbers become OPRF tokens inside the member's node. Nothing downstream ever holds one." },
            { icon: ShieldCheck, t: "No consent, no answer", d: "Every call presents a consent reference bound to the borrower's token. Another borrower's consent buys nothing." },
            { icon: Link2, t: "Signed by the member", d: "Each request carries an Ed25519 signature over its exact bytes. Nobody can ask in a member's name, including us." },
            { icon: ScrollText, t: "A log that proves itself", d: "Every decision is hash-chained. Edit one entry and every entry after it stops verifying." },
            { icon: Scale, t: "Reciprocity in the policy engine", d: "A member that stops contributing stops being able to query, automatically and without a meeting." },
            { icon: Network, t: "Brokered, never pooled", d: "Books stay with their owners. Members answer about their own customers, in aggregates only." },
          ].map(({ icon: Icon, t, d }, i) => (
            <Reveal key={t} delay={0.04 * i}>
              <div className="group h-full rounded-2xl border border-white/[0.07] bg-white/[0.015] p-6 transition-colors hover:border-emerald-500/30">
                <Icon className="h-6 w-6 text-emerald-400 transition-transform group-hover:scale-110" />
                <div className="mt-4 text-[16px] font-medium text-white/90">{t}</div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-white/50">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Developers ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-4 pt-28 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <SectionHead
            eyebrow="Developers"
            title="Already integrated with the bureau? Change a URL and a key."
            lede="Same request fields, same report integers, same has_error and api_code. What changes is the signature, which no one can forge, and the answer, which arrives already read."
          />
          <Reveal delay={0.1}>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#070a09]">
              <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="ml-2 font-mono text-[11px] text-white/35">POST /api/v1/report</span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-white/75">
{`{
  "report_type": 12,
  "identity_number": "880000088",
  "identity_type": "001",
  "loan_amount": 8000,
  "report_reason": 1,
  "consent_ref": "CN-…",
  "format": "pdf"
}`}
              </pre>
              <div className="border-t border-white/[0.07] px-5 py-3 font-mono text-[11px] text-emerald-300/80">
                x-interchange-signature: ed25519(METHOD, PATH, sha256(body), timestamp, nonce, member)
              </div>
            </div>
            <Link href="/docs" className="mt-5 inline-flex items-center gap-1.5 text-[14px] text-emerald-300 hover:text-emerald-200">
              Read the reference <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
