"use client";

// THE FLOOR — the chosen wallpaper in the current theme, with the Interchange's
// cyan washing two corners. Three layers, as in the estate's Backdrop: a flat
// ground (never transparent, so a missing picture is still a finished surface),
// the picture at the skin's opacity, and the accent wash. The picture is only
// painted once it has decoded, with an inlined blur standing in until then, so
// the largest layer on screen never hitches while the console opens.
import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme/useTheme";
import { useSkin } from "@/lib/theme/useSkin";
import { metaFor } from "@/lib/theme/media";

export default function Backdrop({ accent, accent2 }: { accent: string; accent2?: string }) {
  const { resolved } = useTheme();
  const { skin } = useSkin();
  const face = resolved === "dark" ? skin.dark : skin.light;
  const meta = metaFor(face.image);

  // WHICH picture has decoded, not whether one has — comparing resets it for
  // free when the skin changes, without a setState in the effect body.
  const [decoded, setDecoded] = useState<string | null>(null);
  const loaded = decoded !== null && decoded === face.image;
  useEffect(() => {
    const src = face.image;
    if (!src) return;
    let live = true;
    const im = new Image();
    im.src = src;
    im.decode?.().then(
      () => live && setDecoded(src),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [face.image]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{ background: face.ground }}>
      {meta && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
          style={{ backgroundImage: `url('${meta.lqip}')`, opacity: loaded ? 0 : face.opacity, filter: "blur(28px)", transform: "scale(1.06)" }}
        />
      )}
      {face.image && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
          style={{ backgroundImage: `url('${face.image}')`, opacity: loaded ? face.opacity : 0 }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          opacity: face.wash,
          background: `radial-gradient(1100px 720px at 88% -6%, ${accent} 0%, transparent 62%),
                       radial-gradient(880px 620px at 4% 104%, ${accent2 ?? accent} 0%, transparent 58%)`,
        }}
      />
    </div>
  );
}
