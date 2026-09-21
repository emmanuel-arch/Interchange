// ─────────────────────────────────────────────────────────────────────────────
// METROPOL'S API RATE CARD — as the Interchange prices bureau reach.
//
// A COPY of connected-suite/src/lib/crb/rate-card.ts, because the Registry is a
// separate deployment with no import path into the LMS. Change both together.
//
// Source: "MICROMART API Rate Card – V2", Metropol Credit Reference Bureau Ltd,
// received 22 Sep 2026. KES per request, EXCLUSIVE of 16% VAT and 10% excise.
// Report 16 is entitled but not on the card; 22 is not in the contract.
// ─────────────────────────────────────────────────────────────────────────────

export const RATE_CARD = {
  id: "metropol-api-v2",
  title: "MICROMART API Rate Card – V2",
  vatPct: 16,
  excisePct: 10,
  prices: { 1: 25, 2: 25, 3: 50, 4: 80, 5: 80, 6: 25, 8: 100, 10: 150, 11: 175, 12: 200, 13: 100, 14: 200 } as Readonly<Record<number, number>>,
} as const;

/** Net KES per request, or null when the card does not price the report. */
export function rateCardPrice(reportType: number): number | null {
  const p = RATE_CARD.prices[reportType];
  return typeof p === "number" ? p : null;
}

/**
 * The card's price for a set of reports pulled together, net. A report the card
 * does not price (16) adds `unpriced` rather than a guess, so a bundle that
 * contains one says so instead of quietly understating.
 */
export function cardCost(reports: number[]): { net: number; unpriced: number[] } {
  let net = 0;
  const unpriced: number[] = [];
  for (const r of reports) {
    const p = rateCardPrice(r);
    if (p == null) unpriced.push(r);
    else net += p;
  }
  return { net, unpriced };
}

/** Excise on the fee, VAT on fee + excise — the same rule as the LMS copy. */
export function grossOf(net: number): number {
  const excise = (net * RATE_CARD.excisePct) / 100;
  return Math.round((net + excise) * (1 + RATE_CARD.vatPct / 100) * 100) / 100;
}
