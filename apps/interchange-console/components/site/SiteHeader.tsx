"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { InterchangeMark } from "@/components/chrome";
import { NAV } from "@/lib/site/facts";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled || open ? "bg-[#040605]/85 backdrop-blur-xl border-b border-white/[0.07]" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-6 px-4 sm:px-6">
        {/*
          The mark, then the name as LIVE TEXT rather than as part of a logo
          image. Two reasons: the supplied wordmark is navy #003868, which on
          this near-black header measures under 2:1 and is unreadable; and a
          wordmark baked into a raster cannot be selected, searched, read by a
          screen reader or re-rendered crisply at a zoom level nobody predicted.
        */}
        <Link href="/" className="group flex shrink-0 items-center gap-3" onClick={() => setOpen(false)}>
          <InterchangeMark className="h-8 w-8 transition-transform duration-300 group-hover:scale-105" />
          <span className="font-mono text-[13px] font-bold uppercase tracking-[0.3em] text-white/90 group-hover:text-white">
            Interchange
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-2 text-[13px] text-white/55 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/signin"
            className="group inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[13px] font-medium text-emerald-200 transition hover:bg-emerald-500/20"
          >
            Member sign in
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white/80 lg:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <nav className="border-t border-white/[0.06] px-4 pb-5 pt-2 lg:hidden" aria-label="Mobile">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-3 text-[15px] text-white/75 hover:bg-white/[0.04]"
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/signin"
            onClick={() => setOpen(false)}
            className="mt-3 block rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-center text-[15px] font-medium text-emerald-200"
          >
            Member sign in
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
