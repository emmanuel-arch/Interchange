// ─────────────────────────────────────────────────────────────────────────────
// SKINS — the wallpaper the console stands on, in each theme.
//
// The same sixteen floors every other system in the estate offers, with the
// same files (public/themes, copied from connected-suite) and the same numbers.
// A lender who dresses their Lending Console in "Savannah" finds the identical
// picker here, which is the point of the estate: learn one system, you have
// learned seven. See connected-suite lib/theme/skins.ts for why each opacity is
// what it is — they are contrast floors, not taste.
//
// A skin is a FLOOR, never a feature: nothing readable is laid on it. Every
// surface above it is a `.panel` or a `.canvas` with its own background.
// ─────────────────────────────────────────────────────────────────────────────

export type SkinFace = {
  /** A path under /public, or null for no photograph at all. */
  image: string | null;
  /** The flat colour the image is composited onto. Never transparent. */
  ground: string;
  /** How much of the picture survives, 0–1. */
  opacity: number;
  /** How strongly the Interchange's accent washes the corners, 0–1. */
  wash: number;
};

export type Skin = {
  id: string;
  name: string;
  blurb: string;
  light: SkinFace;
  dark: SkinFace;
};

const LIGHT_GROUND = "#f4f4f2";
// The vault's own ground, not the estate's navy-black: in the dark the
// Interchange still looks like the room members already know.
const DARK_GROUND = "#05080a";

const img = (id: string) => `/themes/${id}.webp`;

/** The picker's swatch — 480×300 beside every 2560px wallpaper. */
export const thumbFor = (face: SkinFace): string | null =>
  face.image ? face.image.replace(/\.webp$/, "-thumb.webp") : null;

const photo = (id: string, light = 0.32, dark = 0.22): Pick<Skin, "light" | "dark"> => ({
  light: { image: img(id), ground: LIGHT_GROUND, opacity: light, wash: 0.16 },
  dark: { image: img(id), ground: DARK_GROUND, opacity: dark, wash: 0.3 },
});

const texture = (id: string, light = 0.7, dark = 0.34): Pick<Skin, "light" | "dark"> => ({
  light: { image: img(id), ground: LIGHT_GROUND, opacity: light, wash: 0.14 },
  dark: { image: img(id), ground: DARK_GROUND, opacity: dark, wash: 0.28 },
});

export const SKINS: Skin[] = [
  {
    id: "plain",
    name: "Plain",
    blurb: "No photograph. The Interchange's own colour, and nothing else.",
    light: { image: null, ground: "#f7f7f6", opacity: 0, wash: 0.22 },
    dark: { image: null, ground: "#040605", opacity: 0, wash: 0.34 },
  },
  { id: "paper", name: "Paper", blurb: "Almost nothing. Texture you feel rather than see.", ...texture("paper", 0.8, 0.3) },
  { id: "linen-dark", name: "Charcoal", blurb: "Almost nothing, in the dark.", ...texture("linen-dark", 0.42, 0.36) },
  { id: "mesh-navy", name: "Navy mesh", blurb: "A filament network in the brand's own blue.", ...texture("mesh-navy", 0.55, 0.34) },
  { id: "mesh-lime", name: "Lime mesh", blurb: "The same gesture, in the accent green.", ...texture("mesh-lime", 0.5, 0.32) },
  { id: "gradient", name: "Gradient", blurb: "A slow colour field. The calmest thing in the list.", ...texture("gradient-1", 0.6, 0.34) },
  { id: "ink", name: "Ink", blurb: "Deep, and close to black. Built for the dark theme.", ...texture("dark-1", 0.3, 0.34) },
  { id: "slate", name: "Slate", blurb: "Cold stone. The other dark one.", ...texture("dark-2", 0.32, 0.34) },
  { id: "nairobi-dawn", name: "Nairobi dawn", blurb: "The city, early. Steady and institutional.", ...photo("nairobi-dawn") },
  { id: "savannah", name: "Savannah", blurb: "Acacia and long light. The one everyone keeps.", ...photo("savannah") },
  { id: "coast", name: "Coast", blurb: "Turquoise from above. The cool one.", ...photo("coast", 0.28, 0.2) },
  { id: "tea-fields", name: "Tea", blurb: "Green rows to the horizon. Order, drawn.", ...photo("tea-fields", 0.3, 0.22) },
  { id: "mount-kenya", name: "Mount Kenya", blurb: "Cloud and rock. Height without the cliché.", ...photo("mount-kenya") },
  { id: "market-warm", name: "Market", blurb: "Cloth and colour, out of focus. Warm and mercantile.", ...photo("market-warm", 0.3, 0.2) },
  { id: "boda-motion", name: "Motion", blurb: "A street at speed. Movement, blurred.", ...photo("boda-motion", 0.34, 0.26) },
  { id: "sunset-silhouette", name: "Dusk", blurb: "A tree against orange. The warm dark.", ...photo("sunset-silhouette", 0.3, 0.26) },
];

/**
 * The Interchange opens on the gradient, as the estate's table says: it is
 * shared ground between competitors and must not wear any one lender's character.
 */
export const DEFAULT_SKIN = "gradient";

export const skinFor = (id: string | null | undefined): Skin =>
  SKINS.find((s) => s.id === id) ?? SKINS.find((s) => s.id === DEFAULT_SKIN) ?? SKINS[0];

/** Same key shape as the estate's, so the choice reads the same way everywhere. */
export const SKIN_STORAGE_KEY = "suite:skin:interchange";
