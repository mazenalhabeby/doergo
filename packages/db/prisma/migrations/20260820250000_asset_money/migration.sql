-- Money logged against one asset: rent in, repairs out.
-- Category is TEXT, not a foreign key, so renaming a category on the kind never
-- rewrites history. Amounts are integer cents. Idempotent — no shadow DB.
CREATE TABLE IF NOT EXISTS "asset_money" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assetId"        TEXT NOT NULL,
  "category"       TEXT NOT NULL,
  "direction"      TEXT NOT NULL,
  "amountCents"    INTEGER NOT NULL,
  "note"           TEXT,
  "occurredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorId"       TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_money_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "asset_money_assetId_occurredAt_idx"
  ON "asset_money" ("assetId", "occurredAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_money_assetId_fkey') THEN
    ALTER TABLE "asset_money"
      ADD CONSTRAINT "asset_money_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "assets"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
