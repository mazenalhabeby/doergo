-- The site's drawn outline. NULL keeps today's behaviour exactly: the radius.
-- Additive and idempotent; the shadow database is broken here so migrations are
-- hand-authored and must be safe to re-run.
ALTER TABLE "company_locations"
  ADD COLUMN IF NOT EXISTS "geofencePolygon" JSONB;

-- The column default disagreed with ATTENDANCE_CONSTANTS (15 vs 50), so a row
-- inserted without the field got a 15-metre fence nobody chose. Only the DEFAULT
-- changes; existing rows keep whatever was configured for them, because a site
-- someone deliberately set to 15 is theirs to keep.
ALTER TABLE "company_locations"
  ALTER COLUMN "geofenceRadius" SET DEFAULT 50;
