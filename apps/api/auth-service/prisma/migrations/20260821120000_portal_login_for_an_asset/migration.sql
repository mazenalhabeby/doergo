-- A client can be invited to an ASSET, not only to an apartment.
--
-- Mirrors unitId exactly: the invitation carries it, and accepting binds the new
-- login to it. ON DELETE SET NULL, so removing an asset leaves the login intact
-- rather than deleting somebody's account. Idempotent — no shadow DB.

ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "assetId" TEXT;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "assetId" TEXT;

CREATE INDEX IF NOT EXISTS "users_assetId_idx"       ON "users" ("assetId");
CREATE INDEX IF NOT EXISTS "invitations_assetId_idx" ON "invitations" ("assetId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_assetId_fkey') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "assets"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
