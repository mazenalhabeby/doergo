-- Asset kinds belong to a SPACE.
--
-- Each space defines its own kinds, so the depot's "Vehicles" and the Linz
-- office's "Vehicles" are separate lists. Written idempotently (the shadow DB
-- is unusable in this project, so migrations are hand-authored).

ALTER TABLE "asset_categories" ADD COLUMN IF NOT EXISTS "spaceId" TEXT;

CREATE INDEX IF NOT EXISTS "asset_categories_spaceId_idx"
  ON "asset_categories" ("spaceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asset_categories_spaceId_fkey'
  ) THEN
    ALTER TABLE "asset_categories"
      ADD CONSTRAINT "asset_categories_spaceId_fkey"
      FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- The name was unique per ORG; it is unique per SPACE now, so two spaces can
-- each have their own "Vehicles". Drop the old constraint before adding the new
-- one, or the old one keeps rejecting the second space's copy.
ALTER TABLE "asset_categories" DROP CONSTRAINT IF EXISTS "asset_categories_organizationId_name_key";
DROP INDEX IF EXISTS "asset_categories_organizationId_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "asset_categories_organizationId_spaceId_name_key"
  ON "asset_categories" ("organizationId", "spaceId", "name");
