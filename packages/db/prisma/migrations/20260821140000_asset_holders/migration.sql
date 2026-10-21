-- Who holds an asset, as a table rather than a pair of columns.
--
-- A kind may now say "several residents", and a column cannot hold several
-- without becoming an array nobody can index, join or constrain. One row per
-- holder makes the single case and the many case the same case.
--
-- Idempotent throughout: the shadow database in this project is unusable, so
-- every migration here is hand-authored and safe to re-run.

CREATE TABLE IF NOT EXISTS "asset_holders" (
  "id"         TEXT NOT NULL,
  "assetId"    TEXT NOT NULL,
  "userId"     TEXT,
  "customerId" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_holders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "asset_holders_assetId_idx"    ON "asset_holders"("assetId");
CREATE INDEX IF NOT EXISTS "asset_holders_userId_idx"     ON "asset_holders"("userId");
CREATE INDEX IF NOT EXISTS "asset_holders_customerId_idx" ON "asset_holders"("customerId");

-- The same person cannot be added twice. NULLs are distinct in Postgres, so
-- each of these constrains only the side that is actually set.
CREATE UNIQUE INDEX IF NOT EXISTS "asset_holders_assetId_userId_key"     ON "asset_holders"("assetId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "asset_holders_assetId_customerId_key" ON "asset_holders"("assetId", "customerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_holders_assetId_fkey') THEN
    ALTER TABLE "asset_holders"
      ADD CONSTRAINT "asset_holders_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "assets"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Customers get a real foreign key; members deliberately do not, exactly as the
-- column this replaces had none. Removing a member must never be blocked by an
-- asset still pointing at them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_holders_customerId_fkey') THEN
    ALTER TABLE "asset_holders"
      ADD CONSTRAINT "asset_holders_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Exactly one of the two. A row naming both would show the asset as held by two
-- different kinds of person at once; a row naming neither is a holder who is
-- nobody, invisible and never cleaned up.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_holders_one_holder') THEN
    ALTER TABLE "asset_holders"
      ADD CONSTRAINT "asset_holders_one_holder"
      CHECK (("userId" IS NOT NULL) <> ("customerId" IS NOT NULL));
  END IF;
END $$;

-- Carry the existing single holders across. ON CONFLICT DO NOTHING makes a
-- re-run a no-op rather than a duplicate-key failure.
INSERT INTO "asset_holders" ("id", "assetId", "userId", "customerId", "createdAt")
SELECT
  'ah_' || "id",
  "id",
  "holderUserId",
  "customerId",
  COALESCE("createdAt", CURRENT_TIMESTAMP)
FROM "assets"
WHERE ("holderUserId" IS NOT NULL) <> ("customerId" IS NOT NULL)
ON CONFLICT DO NOTHING;

-- assets."holderUserId" and assets."customerId" are deliberately LEFT IN PLACE
-- and are no longer read. Dropping them in the same step that starts writing
-- somewhere else makes a bad backfill unrecoverable; they come out in a later
-- migration once this has been lived with.
