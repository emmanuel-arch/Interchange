// ─────────────────────────────────────────────────────────────────────────────
// The feature store.
//
// One entry point, and it takes an `asOf`. There is no way to compute a vector
// without naming the instant it is computed as of, because a feature store you
// can accidentally call "for now" is a feature store that will eventually be
// called "for now" inside a training loop — and that is leakage.
//
// THE FILTER THAT MATTERS: `recordedAt <= asOf`, not `at <= asOf`.
//
// An arrears event that occurred on day 5 but was reported on day 20 did not
// exist, as far as anyone could know, on day 10. Including it in a day-10 vector
// trains the model on information the production scorer will never have. The
// backtest looks superb; the model collapses on contact with reality. This is
// the most common way a lending model dies, and it is invisible in every metric
// until it is in production.
//
// Sprint note: this reads Postgres. The blueprint targets Iceberg on R2, whose
// snapshot and time-travel semantics make the same guarantee cheaper at scale.
// The interface is deliberately storage-agnostic so that move is a swap of the
// slice loader, not a rewrite of the definitions.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import {
  FEATURES,
  FEATURE_SET_VERSION,
  PENDING_FAMILIES,
  type LedgerSlice,
} from "./definitions";

export type FeatureVector = {
  subjectToken: string;
  asOf: string;
  featureSetVersion: string;
  values: Record<string, number | null>;
  /** Families that exist in the spec but have no source wired yet. */
  unavailableFamilies: string[];
  eventCount: number;
};

/**
 * Load every event KNOWN as of the given instant.
 *
 * Both bounds are applied: `recordedAt <= asOf` because we cannot use what we
 * had not learned, and `at <= asOf` because an event dated in the future is
 * either a clock problem or a scheduled record, and neither belongs in a vector
 * describing the present.
 */
export async function loadSlice(subjectToken: string, asOf: Date): Promise<LedgerSlice> {
  const events = await prisma.ledgerEvent.findMany({
    where: {
      subjectToken,
      recordedAt: { lte: asOf },
      at: { lte: asOf },
    },
    orderBy: { at: "asc" },
    select: { memberId: true, at: true, kind: true, amountKes: true, daysPastDue: true },
  });

  return { subjectToken, asOf, events };
}

export function computeFrom(slice: LedgerSlice): FeatureVector {
  const values: Record<string, number | null> = {};
  for (const f of FEATURES) {
    try {
      values[f.name] = f.compute(slice);
    } catch {
      // A feature that throws must not take the vector with it. Null is honest:
      // the model sees "unknown", not a fabricated zero.
      values[f.name] = null;
    }
  }

  return {
    subjectToken: slice.subjectToken,
    asOf: slice.asOf.toISOString(),
    featureSetVersion: FEATURE_SET_VERSION,
    values,
    unavailableFamilies: PENDING_FAMILIES.map((p) => p.family),
    eventCount: slice.events.length,
  };
}

/** The whole store, in one call. Serving and training both come through here. */
export async function computeVector(
  subjectToken: string,
  asOf: Date,
): Promise<FeatureVector> {
  return computeFrom(await loadSlice(subjectToken, asOf));
}
