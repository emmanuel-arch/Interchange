-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-08-26 · Generational holdings, and metered batch issuance.
--
-- Written by hand rather than left to `prisma db push --accept-data-loss`,
-- because this runs against the live Registry — a hosted Postgres holding real
-- members and their registered public keys. Every statement below is additive or
-- names exactly what it replaces, so the plan is reviewable instead of inferred.
--
-- WHAT THIS ENABLES
--
--   1. A node can publish a whole book in chunks without ever exposing a window
--      in which the member appears to hold nothing. Chunks land under a new
--      generation; Member.holdingGeneration is what makes one visible.
--
--   2. OPRF issuance is metered per ELEMENT and split by purpose, so a member
--      tokenising its own book does not spend the allowance that exists to stop
--      enumeration of the national ID space.
--
-- SAFETY
--   · No table is dropped.
--   · No existing column is altered or removed.
--   · Every ADD carries a default, so existing rows stay valid.
--   · The one replaced constraint is on MemberHolding, which held 0 rows when
--     this was written — verified against the live database, not assumed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Member ───────────────────────────────────────────────────────────────────
-- holdingGeneration = 0 means "has never published". That is deliberately NOT
-- the same as "holds nothing": /api/node/exposure answers BOOK_NOT_PUBLISHED so
-- the broker records a non-response, rather than clearing a borrower who may owe
-- this member money.
ALTER TABLE "Member"
  ADD COLUMN IF NOT EXISTS "holdingGeneration"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "holdingsPublishedAt" TIMESTAMP(3);

-- ── OprfIssuance ─────────────────────────────────────────────────────────────
-- count: one row per REQUEST now, carrying how many elements it evaluated. The
-- cap is enforced on SUM(count), so batching buys speed and never allowance.
-- kind:  SERVING for a live decision, INGEST for a node reading its own book.
ALTER TABLE "OprfIssuance"
  ADD COLUMN IF NOT EXISTS "count" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "kind"  TEXT    NOT NULL DEFAULT 'SERVING';

-- ── MemberHolding ────────────────────────────────────────────────────────────
ALTER TABLE "MemberHolding"
  ADD COLUMN IF NOT EXISTS "generation" INTEGER NOT NULL DEFAULT 1;

-- The old constraint allowed one row per (member, token). Generational
-- publication needs the same token to exist under the outgoing generation and
-- the incoming one at the same time — that overlap IS the swap.
DROP INDEX IF EXISTS "MemberHolding_memberId_subjectToken_key";

CREATE UNIQUE INDEX IF NOT EXISTS "MemberHolding_memberId_subjectToken_generation_key"
  ON "MemberHolding" ("memberId", "subjectToken", "generation");

-- Serving a query reads one member's current generation; committing a
-- publication deletes the previous one. Both are this index.
CREATE INDEX IF NOT EXISTS "MemberHolding_memberId_generation_idx"
  ON "MemberHolding" ("memberId", "generation");
