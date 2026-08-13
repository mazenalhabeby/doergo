-- Per-address contact person on customer_units (a company customer can have a
-- different on-site contact at each address).
ALTER TABLE "customer_units" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "customer_units" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
