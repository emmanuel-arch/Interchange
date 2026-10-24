"use client";

// ─────────────────────────────────────────────────────────────────────────────
// THE GLASS BUTTON — the one commit button on every front door in the estate.
//
// A port of the Micro Eazy app's LiquidButton (`variant="solid"`), because the
// three systems Micromart sees side by side — the Lending Console, ConnectDesk
// and the Micro Eazy app — must sign people in with the SAME object. Same rim,
// same face, same specular under the pointer, same 3px of travel, same sheen
// sweeping across it on hover. If this file and micro-eazy-app/src/components/
// ui/LiquidButton.tsx drift, the demo shows two products; keep them together.
//
// The anatomy, outermost first:
//   RIM      the darker stop, 2px of it — what makes it read as a machined part
//   FACE     the fill, with a top-light sheen so it is never a flat rectangle
//   HAIRLINE one white pixel along the top edge
//   SPECULAR a soft-light radial that follows the pointer (mouse, pen or finger)
//   SHEEN    a diagonal band of light that crosses the face on hover
//
// Inert (disabled or loading-without-label) drops the fill entirely: a dimmed
// brown button with an arrow still looks like the way forward, and a person who
// presses it and gets nothing concludes the product is broken.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children?: ReactNode;
  /** The face. A lender's accent — Micromart's "fintech brown". */
  fill: string;
  /** The rim, a darker stop of the same colour. Defaults to the fill. */
  rim?: string;
  /** Type on the face. White clears AA on every lender accent in the registry. */
  ink?: string;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  loading?: boolean;
};

export default function GlassButton({
  children,
  fill,
  rim,
  ink = "#ffffff",
  icon: Icon,
  trailingIcon: Trailing,
  loading = false,
  disabled,
  className = "",
  onPointerDown,
  onPointerUp,
  type = "button",
  ...rest
}: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const [spec, setSpec] = useState<{ x: number; y: number } | null>(null);
  const [pressed, setPressed] = useState(false);
  // Loading keeps the fill: the press WAS accepted and something is happening.
  // Only a control that will not respond goes inert.
  const inert = Boolean(disabled) && !loading;
  const busy = loading || Boolean(disabled);

  const track = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const el = ref.current;
      if (!el) return;
      if (e.pointerType !== "mouse" && !pressed) return;
      const r = el.getBoundingClientRect();
      setSpec({ x: e.clientX - r.left, y: e.clientY - r.top });
    },
    [pressed],
  );

  return (
    <button
      ref={ref}
      type={type}
      disabled={busy}
      aria-busy={loading || undefined}
      onPointerMove={track}
      onPointerDown={(e) => {
        setPressed(true);
        track(e);
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        setPressed(false);
        onPointerUp?.(e);
      }}
      onPointerLeave={() => {
        setPressed(false);
        setSpec(null);
      }}
      onPointerCancel={() => {
        setPressed(false);
        setSpec(null);
      }}
      className={
        "glass-btn group relative isolate inline-flex w-full select-none items-center justify-center rounded-full " +
        "font-semibold tracking-[-0.01em] outline-none touch-manipulation " +
        (inert ? "cursor-not-allowed " : loading ? "cursor-progress " : "cursor-pointer ") +
        className
      }
      style={
        {
          "--gb-fill": fill,
          padding: inert ? 0 : 2,
          background: inert ? "#f1f0ec" : (rim ?? fill),
          color: inert ? "#8a8a95" : ink,
          border: inert ? "1px solid rgba(12,12,16,0.12)" : "none",
          transform: pressed && !busy ? "translateY(3px)" : "translateY(0)",
          boxShadow: inert
            ? "none"
            : pressed
              ? "0 2px 6px rgb(0 0 0 / 0.28)"
              : undefined,
        } as React.CSSProperties
      }
      {...rest}
    >
      <span
        className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full px-7 py-[17px] text-[16px]"
        style={{
          background: inert
            ? "transparent"
            : `linear-gradient(180deg, rgb(255 255 255 / 0.22) 0%, rgb(255 255 255 / 0) 52%), ${fill}`,
          boxShadow: inert
            ? "none"
            : pressed
              ? "inset 0 6px 14px rgb(0 0 0 / 0.30)"
              : "inset 0 -2px 6px rgb(0 0 0 / 0.14), inset 0 1px 0 rgb(255 255 255 / 0.35)",
        }}
      >
        {/* The specular — absent until there is a pointer, so the resting state
            is a clean surface rather than a permanent hotspot. */}
        {spec && !inert && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(190px circle at ${spec.x}px ${spec.y}px, rgb(255 255 255 / 0.9) 0%, rgb(255 255 255 / 0.35) 30%, transparent 65%)`,
              opacity: pressed ? 0.55 : 0.34,
              mixBlendMode: "soft-light",
            }}
          />
        )}
        {/* The sheen — see .glass-btn in globals.css. */}
        {!inert && <span aria-hidden className="glass-btn-sheen pointer-events-none absolute inset-0 rounded-full" />}
        {!inert && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-5 top-0 h-px rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent, rgb(255 255 255 / 0.75), transparent)",
              opacity: pressed ? 0 : 1,
              transition: "opacity 110ms ease-out",
            }}
          />
        )}

        {loading ? <Loader2 className="relative h-5 w-5 animate-spin" /> : Icon && <Icon className="relative h-5 w-5" strokeWidth={2.2} />}
        {children && <span className="relative">{children}</span>}
        {Trailing && !loading && (
          <Trailing className="relative h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" strokeWidth={2.2} />
        )}
      </span>
    </button>
  );
}
