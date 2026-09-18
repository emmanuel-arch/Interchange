"use client";

import { useEffect, useState } from "react";

export type DocsSection = { id: string; label: string; children?: { id: string; label: string }[] };

/** The docs sidebar. Highlights the section being read. */
export function DocsNav({ sections }: { sections: DocsSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const ids = sections.flatMap((s) => [s.id, ...(s.children?.map((c) => c.id) ?? [])]);
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Documentation" className="text-[13px]">
      <ul className="space-y-1">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`block rounded-md px-3 py-1.5 transition-colors ${active === s.id ? "bg-emerald-500/10 text-emerald-200" : "text-white/55 hover:text-white"}`}
            >
              {s.label}
            </a>
            {s.children?.length ? (
              <ul className="ml-3 mt-1 space-y-0.5 border-l border-white/[0.07] pl-2">
                {s.children.map((c) => (
                  <li key={c.id}>
                    <a
                      href={`#${c.id}`}
                      className={`block rounded px-2 py-1 text-[12.5px] transition-colors ${active === c.id ? "text-emerald-200" : "text-white/40 hover:text-white/80"}`}
                    >
                      {c.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
