-- Assets no longer sit inside other assets.
--
-- The "Inside" tab let a machine be broken into subunits and components (ISO
-- 14224 levels 6-9). It is being removed: the nesting was more structure than
-- the product needed, and it complicated everything that had to ask "is this a
-- whole thing or a part of one" — the billing count most of all.
--
-- Every nested row was deleted before this ran, so there is nothing left for
-- the column to point at.
--
-- Idempotent, like every migration here: the shadow database in this project
-- is unusable, so these are hand-authored and safe to re-run.

-- Any row still nested when this runs would silently lose its parent, so stop
-- instead: a non-empty column here means the cleanup did not happen.
DO $$
DECLARE nested INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'parentId'
  ) THEN
    EXECUTE 'SELECT count(*) FROM "assets" WHERE "parentId" IS NOT NULL' INTO nested;
    IF nested > 0 THEN
      RAISE EXCEPTION 'Refusing to drop "parentId": % asset(s) are still nested. Move or delete them first.', nested;
    END IF;
  END IF;
END $$;

ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_parentId_fkey";
DROP INDEX IF EXISTS "assets_parentId_idx";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "parentId";
