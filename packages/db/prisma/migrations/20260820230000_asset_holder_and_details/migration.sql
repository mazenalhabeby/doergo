-- An asset record gets what an apartment record has: somebody who holds it
-- (a member OR a client) and the values for the fields its kind asks for.
-- Idempotent — hand-authored, no shadow DB.

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "holderUserId" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "customerId"   TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "details"      JSONB;

CREATE INDEX IF NOT EXISTS "assets_holderUserId_idx" ON "assets" ("holderUserId");
CREATE INDEX IF NOT EXISTS "assets_customerId_idx"   ON "assets" ("customerId");

-- holderUserId deliberately has NO foreign key, mirroring
-- CustomerUnit.residentUserId: removing a member must never be blocked by a
-- record that happens to name them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_customerId_fkey') THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
