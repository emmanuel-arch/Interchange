import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Braces, FileDown, Sheet, Globe, ShieldCheck } from "lucide-react";
import { PREVIEW, previewByType, STATUS_LABEL, kb } from "@/lib/preview/manifest";
import { bureauReportType } from "@/lib/codes/metropol";

export function generateStaticParams() {
  return PREVIEW.products.filter((p) => p.files?.html).map((p) => ({ type: String(p.type) }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/preview/[type]">): Promise<Metadata> {
  const { type } = await params;
  const p = previewByType(Number(type));
  return { title: p ? `${p.name} sample · The Interchange` : "Sample · The Interchange" };
}

const FILES = [
  { key: "pdf", label: "PDF", sub: "On the Interchange letterhead", icon: FileText },
  { key: "json", label: "JSON", sub: "Interchange format, codes in words", icon: Braces },
  { key: "bureau", label: "Bureau response", sub: "As the bureau sent it, identity replaced", icon: FileDown },
  { key: "csv", label: "CSV", sub: "Every account, one row", icon: Sheet },
  { key: "html", label: "HTML", sub: "The document, before print", icon: Globe },
] as const;

export default async function PreviewSample({ params }: PageProps<"/preview/[type]">) {
  const { type } = await params;
  const p = previewByType(Number(type));
  if (!p || !p.files?.html) notFound();
  const def = bureauReportType(p.type);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-10 sm:px-6 sm:pt-14">
      <Link href="/preview" className="inline-flex items-center gap-1.5 text-[13px] text-white/50 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All samples
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400/80">Bureau Direct · Report {p.type}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[40px]">{p.name}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/55">{p.answers}</p>

          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#eeeee9]">
            <iframe
              src={p.files.html.path}
              title={`${p.name} sample document`}
              className="block h-[78vh] min-h-[560px] w-full bg-white"
              loading="lazy"
              sandbox=""
            />
          </div>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="inst text-[10px] text-white/35">Downloads</div>
            <ul className="mt-4 space-y-2">
              {FILES.map(({ key, label, sub, icon: Icon }) => {
                const f = p.files?.[key];
                if (!f) return null;
                return (
                  <li key={key}>
                    <a
                      href={f.path}
                      download
                      className="group flex items-center gap-3 rounded-xl border border-white/[0.07] px-3.5 py-3 transition hover:border-emerald-500/35 hover:bg-emerald-500/[0.05]"
                    >
                      <Icon className="h-5 w-5 shrink-0 text-emerald-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] text-white/90">{label}</span>
                        <span className="block truncate text-[12px] text-white/45">{sub}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-white/35">
                        {kb(f.bytes)}
                        {f.pages ? ` · ${f.pages}p` : ""}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="inst text-[10px] text-white/35">Provenance</div>
            <dl className="mt-4 space-y-3 text-[13px]">
              <div>
                <dt className="text-white/40">Evidence</dt>
                <dd className="mt-0.5 text-white/80">{p.status === "section" ? `Section of the report ${p.sectionOf} response` : STATUS_LABEL[p.status]}</dd>
              </div>
              <div>
                <dt className="text-white/40">Reference</dt>
                <dd className="mt-0.5 font-mono text-white/80">
                  <Link href={`/verify/${p.reference}`} className="hover:text-emerald-300">
                    {p.reference}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Bureau report date</dt>
                <dd className="mt-0.5 font-mono text-white/80">{p.reportDate}</dd>
              </div>
              <div>
                <dt className="text-white/40">Content fingerprint</dt>
                <dd className="mt-0.5 break-all font-mono text-[11.5px] text-white/60">sha256:{p.contentDigest}</dd>
              </div>
            </dl>
          </div>

          {def ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="inst text-[10px] text-white/35">Carries</div>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {def.contains.map((c) => (
                  <li key={c} className="rounded-md border border-white/10 px-2 py-1 text-[12px] text-white/65">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <p className="text-[12.5px] leading-relaxed text-white/60">
              Every identifying detail was replaced before this sample was written, and each file was scanned for every original
              value before it was kept.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
