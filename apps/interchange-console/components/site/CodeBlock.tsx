"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ code, title, language }: { code: string; title?: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-5 overflow-hidden rounded-xl border border-white/10 bg-[#070a09]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2">
        <span className="truncate font-mono text-[11px] text-white/40">{title ?? language ?? ""}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            });
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 font-mono text-[11px] text-white/45 hover:bg-white/[0.05] hover:text-white"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[520px] overflow-auto p-4 font-mono text-[12.5px] leading-relaxed text-white/80">
        <code>{code}</code>
      </pre>
    </div>
  );
}
