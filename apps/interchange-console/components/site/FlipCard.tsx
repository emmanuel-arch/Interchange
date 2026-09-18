"use client";

import { useState, type ReactNode } from "react";

/**
 * A product card with a question on the front and the terms on the back.
 * Hover turns it on a pointer device (CSS), tap or Enter turns it everywhere.
 */
export function FlipCard({ front, back, label, className = "" }: { front: ReactNode; back: ReactNode; label: string; className?: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className={`flip ${className}`}
      data-flipped={flipped}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${label}: show ${flipped ? "the question" : "the details"}`}
      onClick={() => setFlipped((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setFlipped((v) => !v);
        }
      }}
    >
      <div className="flip-inner">
        <div className="flip-face">{front}</div>
        <div className="flip-face flip-back">{back}</div>
      </div>
    </div>
  );
}
