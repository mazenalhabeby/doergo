-- Per-space CRM: a Customer belongs to a Space's Customers list (spaceId) and has
-- a sales owner (ownerId). Additive + idempotent.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "spaceId" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;

CREATE INDEX IF NOT EXISTS "customers_organizationId_spaceId_idx" ON "customers" ("organizationId", "spaceId");

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
