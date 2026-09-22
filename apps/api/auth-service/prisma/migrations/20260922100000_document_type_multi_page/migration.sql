-- A document type that is sheets of paper rather than a card.
--
-- Additive and idempotent: every existing type keeps `false`, which is exactly
-- today's behaviour (single sheet, or front-and-back where twoSided is set).
-- Nothing is backfilled and nothing changes for anyone on the day this ships.
ALTER TABLE "document_types"
  ADD COLUMN IF NOT EXISTS "multiPage" BOOLEAN NOT NULL DEFAULT false;
