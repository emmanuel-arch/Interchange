// ─────────────────────────────────────────────────────────────────────────────
// Bloom filter over subject tokens.
//
// Each member publishes one covering the borrowers they currently hold. The
// broker screens a query against every member's filter locally and fans out only
// to those with a probable hit — typically one to three of eleven, instead of
// all of them.
//
// The privacy argument matters more than the latency one. An unscreened fan-out
// tells every member in the ecosystem that a named token is being evaluated
// right now, which leaks a competitor's origination pipeline in real time.
// Screening locally means most members never learn the query happened.
//
// FALSE POSITIVES ARE FINE — the member is asked and answers "nothing here".
// FALSE NEGATIVES ARE NOT — they would silently hide real exposure, which is
// exactly the failure this product cannot have. Bloom filters cannot produce
// false negatives, which is why this is the right structure and why a cache or
// a sample would not be.
//
// Rolled by hand rather than pulled in, because the bit layout is a wire format
// between members: it has to be stable, documented, and reimplementable by
// someone writing a node in another language.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "crypto";

export type BloomParams = { m: number; k: number };

/**
 * Size a filter for `n` items at a target false-positive rate.
 *   m = -n·ln(p) / (ln2)²      k = (m/n)·ln2
 * Rounded up to whole bytes so the wire format is byte-aligned.
 */
export function sizeFor(n: number, p = 0.01): BloomParams {
  const items = Math.max(1, n);
  const mBits = Math.ceil((-items * Math.log(p)) / Math.LN2 ** 2);
  const m = Math.ceil(mBits / 8) * 8;
  const k = Math.max(1, Math.round((m / items) * Math.LN2));
  return { m, k };
}

/**
 * Derive k bit positions from one SHA-256 digest (Kirsch–Mitzenmacher):
 * h_i = h1 + i·h2. Two independent hashes are enough for k of them, and it
 * keeps the digest count at one per lookup rather than k.
 */
function positions(token: string, { m, k }: BloomParams): number[] {
  const d = createHash("sha256").update(token, "utf8").digest();
  // Two 32-bit halves, read unsigned.
  const h1 = d.readUInt32BE(0);
  const h2 = d.readUInt32BE(4) | 1; // odd, so it strides the whole space
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    // Modulo in float space would lose precision past 2^32; keep it in ints.
    out.push(Number((BigInt(h1) + BigInt(i) * BigInt(h2)) % BigInt(m)));
  }
  return out;
}

export function build(tokens: string[], p = 0.01): {
  bits: Buffer;
  params: BloomParams;
  itemCount: number;
} {
  const params = sizeFor(tokens.length, p);
  const bits = Buffer.alloc(params.m / 8);
  for (const t of tokens) {
    for (const pos of positions(t, params)) {
      bits[pos >>> 3] |= 1 << (pos & 7);
    }
  }
  return { bits, params, itemCount: tokens.length };
}

export function mightContain(
  bits: Buffer | Uint8Array,
  params: BloomParams,
  token: string,
): boolean {
  for (const pos of positions(token, params)) {
    if ((bits[pos >>> 3] & (1 << (pos & 7))) === 0) return false;
  }
  return true;
}

/** Observed fill ratio — useful for spotting a filter that has been outgrown. */
export function saturation(bits: Buffer | Uint8Array, m: number): number {
  let set = 0;
  for (const byte of bits) {
    let b = byte;
    while (b) {
      set += b & 1;
      b >>= 1;
    }
  }
  return set / m;
}
