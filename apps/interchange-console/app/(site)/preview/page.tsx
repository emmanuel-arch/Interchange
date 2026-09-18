import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { PREVIEW, STATUS_LABEL, type PreviewProduct } from "@/lib/preview/manifest";
import { Reveal } from "@/components/site/Reveal";

export const metadata: Metadata = {
  title: "Live samples · The Interchange",
  description: "Every Bureau Direct product as a lender receives it: PDF on the Interchange letterhead, JSON, the bureau's response and CSV, built from a real response with the identity replaced.",
};

const TONE: Record<PreviewProduct["status"], string> = {
  captured: "border-emerald-500/30 text-emerald-300",
  section: "border-sky-400/30 text-sky-300",
  needs_pull: "border-amber-500/30 text-amber-300",
  described: "border-white/15 text-white/45",
  refused: "border-red-500/30 text-red-300",
};

export default function PreviewGallery() {
  const ready = PREVIEW.products.filter((p) => p.files?.html);
  const pending = PREVIEW.products.filter((p) => !p.files?.html);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-14 sm:px-6 sm:pt-20">
      <Reveal>
        <div className="inst text-[10px] text-emerald-400/80">Live samples</div>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-[52px]">What a live request returns, file for file.</h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/55 sm:text-base">
          Each sample was built from a real bureau response. The person was replaced with a stand-in, {PREVIEW.person.name}, under
          test ID {PREVIEW.person.idNumber}, which matches no real file. Amounts, dates, statuses and scores are exactly as the
          bureau returned them.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] px-5 py-4">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <span className="text-[14px] text-white/75">
            Leak scan: {PREVIEW.leakScan.files} files checked for every name, ID, phone, date, account number and transaction ID in the
            original. <span className="text-emerald-300">{PREVIEW.leakScan.leaks} found.</span>
          </span>
        </div>
      </Reveal>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {ready.map((p, i) => (
          <Reveal key={p.type} delay={Math.min(0.04 * i, 0.3)}>
            <Link href={`/preview/${p.type}`} className="group block">
              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white transition duration-500 group-hover:-translate-y-1 group-hover:shadow-[0_30px_80px_-30px_rgba(16,185,129,0.45)]">
                {p.files?.thumb ? (
                  <Image src={p.files.thumb.path} alt={`Page one of the ${p.name} sample`} width={794} height={1123} className="h-auto w-full" />
                ) : (
                  <div className="aspect-[794/1123]" />
                )}
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">Report {p.type}</div>
                  <div className="mt-1 text-[16px] font-medium text-white/90">{p.name}</div>
                </div>
                <ArrowRight className="mt-5 h-4 w-4 shrink-0 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-emerald-300" />
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">{p.answers}</p>
              <span className={`mt-3 inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${TONE[p.status]}`}>
                {p.status === "section" ? `Section of report ${p.sectionOf}` : STATUS_LABEL[p.status]}
              </span>
            </Link>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <h2 className="mt-24 text-2xl font-semibold tracking-tight">The rest of the bureau catalogue</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-white/50">
          These answer through the same call. They are not shown here because no real response has been captured to build a
          sample from, and a sample is never invented.
        </p>
      </Reveal>
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08]">
        {pending.map((p) => (
          <div key={p.type} className="grid gap-2 border-b border-white/[0.06] px-5 py-4 last:border-0 sm:grid-cols-[90px_1.1fr_1.6fr_auto] sm:items-center sm:gap-6">
            <span className="font-mono text-[12px] text-white/40">Report {p.type}</span>
            <span className="text-[15px] text-white/85">{p.name}</span>
            <span className="text-[13px] text-white/50">{p.answers}</span>
            <span className={`justify-self-start rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${TONE[p.status]}`}>
              {STATUS_LABEL[p.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
