-- Two things a technician needs at a machine:
--   1. structure — a machine breaks into subunits and components (ISO 14224
--      levels 6-9), to whatever depth the equipment warrants
--   2. shared catalogues — the parts list and fault-code library are identical
--      for every machine of a model, so they are typed once against the KIND
-- Idempotent — hand-authored, no shadow DB.

-- 1. Structure -----------------------------------------------------------
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
CREATE INDEX IF NOT EXISTS "assets_parentId_idx" ON "assets" ("parentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_parentId_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "assets"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 2. A row belongs to a record OR to the kind ----------------------------
ALTER TABLE "asset_list_rows" ALTER COLUMN "assetId" DROP NOT NULL;
ALTER TABLE "asset_list_rows" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
CREATE INDEX IF NOT EXISTS "asset_list_rows_categoryId_list_position_idx"
  ON "asset_list_rows" ("categoryId", "list", "position");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_list_rows_categoryId_fkey') THEN
    ALTER TABLE "asset_list_rows"
      ADD CONSTRAINT "asset_list_rows_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Exactly one owner. A row owned by both would show twice; a row owned by
-- neither would be unreachable and never cleaned up.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_list_rows_one_owner') THEN
    ALTER TABLE "asset_list_rows"
      ADD CONSTRAINT "asset_list_rows_one_owner"
      CHECK (("assetId" IS NOT NULL) <> ("categoryId" IS NOT NULL));
  END IF;
END $$;
