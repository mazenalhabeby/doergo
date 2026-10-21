-- What happened to one asset: notes, and events worth keeping (who it passed
-- to, when). Idempotent — hand-authored, no shadow DB.
CREATE TABLE IF NOT EXISTS "asset_activities" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assetId"        TEXT NOT NULL,
  "type"           TEXT NOT NULL DEFAULT 'NOTE',
  "body"           TEXT,
  -- authorId carries no FK on purpose: removing a member must never block, nor
  -- erase the record of what they did.
  "authorId"       TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "asset_activities_assetId_createdAt_idx"
  ON "asset_activities" ("assetId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_activities_assetId_fkey') THEN
    ALTER TABLE "asset_activities"
      ADD CONSTRAINT "asset_activities_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "assets"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
