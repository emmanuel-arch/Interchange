import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { previewByReference, CRUNCH_SAMPLE } from "@/lib/preview/manifest";

export const metadata: Metadata = { title: "Verify a document · The Interchange", robots: { index: false } };

// ─────────────────────────────────────────────────────────────────────────────
// /verify/<reference> — where the QR code on every document lands.
//
// It confirms a reference exists and prints the fingerprint the document's
// content must match. It never shows the content itself: a reference is printed
// on paper that travels, and a page that returned the credit file to anyone who
// typed the reference would turn every photocopy into a data leak.
//
// On this deployment the index is the published samples. Live documents are
// looked up in the Registry by the engine; until the engine answers here, a live
// reference is reported as "not found on this deployment", never as forged.
// ─────────────────────────────────────────────────────────────────────────────
export default async function Verify({ params }: PageProps<"/verify/[ref]">) {
  const { ref } = await params;
  const reference = decodeURIComponent(ref).toUpperCase();
  const sample = previewByReference(reference);
  const crunch = CRUNCH_SAMPLE.reference === reference ? CRUNCH_SAMPLE : null;
  const wellFormed = /^IX-[0-9A-Z]{4}-[0-9A-Z]{4}-\d{8}$/.test(reference);

  return (
    <div className="mx-auto max-w-[760px] px-4 pt-16 sm:px-6 sm:pt-24">
      <div className="inst text-[10px] text-emerald-400/80">Document verification</div>
      <h1 className="mt-3 break-all font-mono text-2xl font-semibold sm:text-3xl">{reference}</h1>

      {crunch ? (
        <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            <span className="text-[17px] font-medium text-emerald-100">This reference exists.</span>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-white/65">
            It is a published <b>sample</b>: report 11, Cashflow &amp; Affordability, produced by the production statement engine from a
            <b> synthetic</b> M-PESA statement. It describes no real person.
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[12px] text-white/40">Report date</dt>
              <dd className="mt-1 font-mono text-[13px] text-white/85">{crunch.reportDate}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[12px] text-white/40">The content fingerprint printed on the document must read</dt>
              <dd className="mt-1 break-all font-mono text-[13px] text-emerald-200">sha256:{crunch.contentDigest}</dd>
            </div>
          </dl>
          <Link href="/preview/crunch" className="mt-6 inline-block text-[14px] text-emerald-300 hover:text-emerald-200">
            Open the crunch demo →
          </Link>
        </div>
      ) : sample ? (
        <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            <span className="text-[17px] font-medium text-emerald-100">This reference exists.</span>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-white/65">
            It is a published <b>sample</b>: report {sample.type}, {sample.name}, built from a real bureau response with every
            identifying detail replaced. It describes no real person.
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[12px] text-white/40">Bureau report date</dt>
              <dd className="mt-1 font-mono text-[13px] text-white/85">{sample.reportDate}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-white/40">Requesting organisation</dt>
              <dd className="mt-1 text-[13px] text-white/85">Sample Lender Limited</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[12px] text-white/40">The content fingerprint printed on the document must read</dt>
              <dd className="mt-1 break-all font-mono text-[13px] text-emerald-200">sha256:{sample.contentDigest}</dd>
            </div>
          </dl>
          <Link href={`/preview/${sample.type}`} className="mt-6 inline-block text-[14px] text-emerald-300 hover:text-emerald-200">
            Open the sample →
          </Link>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center gap-3">
            <XCircle className="h-6 w-6 text-white/40" />
            <span className="text-[17px] font-medium text-white/85">
              {wellFormed ? "Not found on this deployment." : "This is not an Interchange reference."}
            </span>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-white/55">
            {wellFormed
              ? "Live documents are verified against the Registry. If you hold a document with this reference, ask the organisation that issued it to confirm it through their member portal, which checks the message log directly."
              : "Interchange references read IX-XXXX-XXXX-YYYYMMDD. Check the reference printed beside the QR code."}
          </p>
        </div>
      )}
    </div>
  );
}
