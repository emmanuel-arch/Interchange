import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CrunchDemo } from "@/components/crunch/CrunchDemo";

export const metadata: Metadata = {
  title: "Statement Crunch theatre · The Interchange",
  description: "Watch an M-PESA statement decrypt, parse, post to ledgers, audit and score, on the production engine.",
};

export default function CrunchPreview() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-10 sm:px-6 sm:pt-14">
      <Link href="/preview" className="inline-flex items-center gap-1.5 text-[13px] text-white/50 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All samples
      </Link>
      <div className="mt-6">
        <CrunchDemo />
      </div>
    </div>
  );
}
