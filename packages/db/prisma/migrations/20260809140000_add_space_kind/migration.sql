-- Space ownership classification (PROJECT | COMPANY | CUSTOMER) + customer contact
-- fields on CompanyLocation. Additive & idempotent. Existing spaces default to
-- COMPANY. A CUSTOMER space represents a customer company (replaces the retired
-- B2B Customers directory); portal residents remain on the Customer model.
DO $$ BEGIN
  CREATE TYPE "SpaceKind" AS ENUM ('PROJECT', 'COMPANY', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "kind" "SpaceKind" NOT NULL DEFAULT 'COMPANY';
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
-- Provenance marker for the customer-space backfill (idempotency by source id).
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "sourceCustomerId" TEXT;

-- Serves kind filtering AND name-sorted space lists (pickers + customer directory).
CREATE INDEX IF NOT EXISTS "company_locations_organizationId_kind_name_idx" ON "company_locations" ("organizationId", "kind", "name");
CREATE INDEX IF NOT EXISTS "company_locations_sourceCustomerId_idx" ON "company_locations" ("sourceCustomerId");
