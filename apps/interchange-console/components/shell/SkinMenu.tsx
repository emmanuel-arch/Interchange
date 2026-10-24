"use client";

// The background picker — the estate's SkinMenu: a live thumbnail of the current
// floor on the button, every skin as a 48px tile in the sheet. Thumbnails, never
// the 2560px wallpapers: this menu draws all sixteen at once.
import { useEffect, useRef, useState } from "react";
import { Check, Images } from "lucide-react";
import { useTheme } from "@/lib/theme/useTheme";
import { useSkin } from "@/lib/theme/useSkin";
import { SKINS, thumbFor, type SkinFace } from "@/lib/theme/skins";

function swatchStyle(face: SkinFace, accent: string): React.CSSProperties {
  const layers = [
    `radial-gradient(120% 120% at 88% 0%, ${accent}, transparent 62%)`,
    face.image ? `url('${thumbFor(face) ?? face.image}')` : null,
  ].filter(Boolean) as string[];
  return { backgroundImage: layers.join(", "), backgroundColor: face.ground, backgroundSize: "cover", backgroundPosition: "center" };
}

export default function SkinMenu({ accent }: { accent: string }) {
  const { resolved } = useTheme();
  const { skinId, setSkin } = useSkin();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const face = (id: string): SkinFace => {
    const s = SKINS.find((x) => x.id === id) ?? SKINS[0];
    return resolved === "dark" ? s.dark : s.light;
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Background"
        className="panel flex h-10 items-center gap-2 rounded-2xl px-2.5 text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)]"
      >
        <span aria-hidden className="h-5 w-5 shrink-0 rounded-md ring-1 ring-[color:var(--ink)]/15" style={swatchStyle(face(skinId), accent)} />
        <Images className="h-3.5 w-3.5" />
        <span className="sr-only">Change the background</span>
      </button>

      {open && (
        <div role="menu" className="sheet absolute right-0 top-12 z-50 max-h-[70vh] w-64 overflow-y-auto rounded-2xl p-1.5">
          <p className="t-label px-2.5 pb-1.5 pt-1">Background</p>
          {SKINS.map((s) => {
            const on = s.id === skinId;
            return (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  setSkin(s.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors ${
                  on ? "bg-[color:var(--ink)]/[0.07]" : "hover:bg-[color:var(--ink)]/[0.045]"
                }`}
              >
                <span aria-hidden className="h-9 w-12 shrink-0 rounded-lg ring-1 ring-[color:var(--ink)]/12" style={swatchStyle(face(s.id), accent)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-[color:var(--ink)]">{s.name}</span>
                  <span className="block truncate text-[10.5px] text-[color:var(--ink-faint)]">{s.blurb}</span>
                </span>
                {on && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
