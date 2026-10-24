"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE LENDER'S PHOTOGRAPH, FRAMED — the left half of a staff door. Copied
// from connected-suite components/auth/DoorFrame.tsx so the Interchange door is
// the estate's door, not a lookalike.
//
// The treatment is the Interchange's "Bureau Direct" sample: a card on a dark
// ground, turned a few degrees in perspective, lit from behind, with a caption
// underneath and a way to open it. There it makes a PDF read as a document you
// could pick up; here it makes Micromart's own counter read as a place rather
// than as a stock background behind a form.
//
// It is interactive on purpose, because that is the difference the founder
// asked for between "an image" and "a design":
//
//   · at rest the card is turned toward the form, as though showing it;
//   · under the pointer it straightens and follows it — a few degrees of tilt
//     and a soft light that tracks the cursor across the glass;
//   · a click (or "Open") shows the photograph full-size; Escape, the close
//     button or a click on the backdrop puts it away. Where the lender has a
//     website on its door (lib/suite/doors.ts), the link reads "Read more" and
//     goes there instead.
//
// Reduced motion keeps the frame and drops the tilt.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { DoorPhoto } from "@/lib/lenders";

/** The photograph and the light behind it — the lender's highlight colour. */
type DoorArt = DoorPhoto & { glow: string };

const REST = { rx: 2, ry: 7 };

export default function DoorFrame({ art }: { art: DoorArt }) {
  const card = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState<{ rx: number; ry: number; x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (reduce || e.pointerType !== "mouse") return;
      const el = card.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      setTilt({ ry: (px - 0.5) * 9, rx: -(py - 0.5) * 7, x: px * 100, y: py * 100 });
    },
    [reduce],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const rx = reduce ? 0 : (tilt?.rx ?? REST.rx);
  const ry = reduce ? 0 : (tilt?.ry ?? REST.ry);

  return (
    <>
      <div className="door-frame card-rise" style={{ animationDelay: "80ms" }}>
        {/* The light behind it — the lender's gold, not ours. */}
        <div
          aria-hidden
          className="door-frame-glow"
          style={{ background: `radial-gradient(62% 58% at 50% 50%, ${art.glow}66, transparent 72%)`, opacity: tilt ? 1 : 0.8 }}
        />
        <button
          ref={card}
          type="button"
          onPointerMove={onMove}
          onPointerLeave={() => setTilt(null)}
          onClick={() => setOpen(true)}
          aria-label={`Open the photograph: ${art.alt}`}
          className="door-frame-card"
          style={{
            transform: `perspective(1600px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${tilt ? -6 : 0}px)`,
            transition: tilt ? "transform 120ms ease-out" : "transform 700ms cubic-bezier(0.16, 1, 0.3, 1)",
            aspectRatio: `${art.width} / ${art.height}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art.file}
            alt={art.alt}
            width={art.width}
            height={art.height}
            fetchPriority="high"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover"
          />
          {/* The glass: a fixed top-light, and a highlight that follows the pointer. */}
          <span aria-hidden className="door-frame-sheen" />
          {tilt && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(420px circle at ${tilt.x}% ${tilt.y}%, rgb(255 255 255 / 0.22), transparent 60%)`,
                mixBlendMode: "soft-light",
              }}
            />
          )}
        </button>

        <div className="relative mt-5 flex items-center justify-between gap-4 text-[13px]">
          <span className="text-white/60">{art.caption}</span>
          {/* A lender with a website: "Read more" goes there, in a new tab, so
              the sign-in stays where it was. The photograph still opens
              full-size on a click. */}
          {art.website ? (
            <a
              href={art.website}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1 font-medium transition-colors"
              style={{ color: art.glow }}
            >
              Read more
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="group inline-flex items-center gap-1 font-medium transition-colors"
              style={{ color: art.glow }}
            >
              Open
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={art.alt}
          className="door-lightbox"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art.file}
            alt={art.alt}
            className="door-lightbox-img"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[13px] text-white/60">{art.caption}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-6 top-6 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
