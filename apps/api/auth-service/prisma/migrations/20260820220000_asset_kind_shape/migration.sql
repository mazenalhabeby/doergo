-- A kind describes what its records look like: name label, address (with map),
-- holder (the apartment "resident", generalised and renameable) and the fields
-- every record is prompted for. Idempotent — hand-authored, no shadow DB.
ALTER TABLE "asset_categories" ADD COLUMN IF NOT EXISTS "config" JSONB;
