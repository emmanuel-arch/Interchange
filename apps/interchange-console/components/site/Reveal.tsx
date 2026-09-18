"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Rises into place the first time it scrolls into view.
 *
 * VISIBLE BY DEFAULT. The first version rendered at opacity 0 on the server and
 * waited for JavaScript to fade it in, which left the whole page blank for a
 * crawler, a slow phone, a failed bundle and a print. Now the server sends the
 * content as it is; only once running in a browser does an element that is
 * still below the fold step back and wait to be scrolled to. Anything already
 * on screen at load never flickers.
 */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "waiting" | "shown">("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already on screen: leave it be
    setState("waiting");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -60px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={
        state === "static"
          ? undefined
          : {
              opacity: state === "shown" ? 1 : 0,
              transform: state === "shown" ? "none" : "translateY(24px)",
              transition: `opacity 700ms cubic-bezier(0.2,0.8,0.2,1) ${delay}s, transform 700ms cubic-bezier(0.2,0.8,0.2,1) ${delay}s`,
            }
      }
    >
      {children}
    </div>
  );
}
