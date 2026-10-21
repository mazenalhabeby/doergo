-- Rows of a table on a record: a machine's parts, an apartment's keys.
-- A table rather than JSON on the asset, so hundreds of parts do not ride along
-- with every read of the record. Idempotent — hand-authored, no shadow DB.
CREATE TABLE IF NOT EXISTS "asset_list_rows" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assetId"        TEXT NOT NULL,
  "list"           TEXT NOT NULL,
  "values"         JSONB NOT NULL,
  "position"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_list_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "asset_list_rows_assetId_list_position_idx"
  ON "asset_list_rows" ("assetId", "list", "position");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_list_rows_assetId_fkey') THEN
    ALTER TABLE "asset_list_rows"
      ADD CONSTRAINT "asset_list_rows_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "assets"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
