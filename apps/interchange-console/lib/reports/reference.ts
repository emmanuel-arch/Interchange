// ─────────────────────────────────────────────────────────────────────────────
// Document references, dates and QR codes.
//
// A reference is what a lender reads down a phone line, so it avoids the
// characters people mishear or mistype (Crockford base32: no I, L, O, U) and it
// carries the date, the way the bureau's own references do.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "crypto";
import qrcode from "qrcode-generator";
import { PUBLIC_ORIGIN } from "@/lib/brand";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** IX-7K2Q-9WMC-20260915, derived from whatever makes the document unique. */
export function documentReference(seed: string, at: Date = new Date()): string {
  const digest = createHash("sha256").update(seed, "utf8").digest();
  let chars = "";
  for (let i = 0; i < 8; i++) chars += CROCKFORD[digest[i] % 32];
  const ymd = eatParts(at).slice(0, 3).join("");
  return `IX-${chars.slice(0, 4)}-${chars.slice(4)}-${ymd}`;
}

function eatParts(d: Date): string[] {
  // East Africa Time is UTC+3 all year — no daylight saving to get wrong.
  const eat = new Date(d.getTime() + 3 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return [String(eat.getUTCFullYear()), p(eat.getUTCMonth() + 1), p(eat.getUTCDate()), p(eat.getUTCHours()), p(eat.getUTCMinutes()), p(eat.getUTCSeconds())];
}

/** "2026-09-15 16:07:28 EAT" — the bureau's layout, with the zone said out loud. */
export function eatTimestamp(d: Date = new Date()): string {
  const [y, mo, da, h, mi, s] = eatParts(d);
  return `${y}-${mo}-${da} ${h}:${mi}:${s} EAT`;
}

export const verifyUrl = (reference: string) => `${PUBLIC_ORIGIN}/verify/${encodeURIComponent(reference)}`;

/** SHA-256 of a UTF-8 string, hex. */
export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/**
 * A QR code as inline SVG. Drawn as one path of unit squares, so it prints
 * crisply at any size and needs no image decoding in the renderer.
 */
export function qrSvg(text: string, sizeMm = 20, color = "#0b0b0b"): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  const box = n + quiet * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${sizeMm}mm" height="${sizeMm}mm" ` +
    `shape-rendering="crispEdges" aria-label="Verification code"><rect width="${box}" height="${box}" fill="#fff"/>` +
    `<path d="${d}" fill="${color}"/></svg>`
  );
}
