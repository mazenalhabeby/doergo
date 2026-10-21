-- Distinguish customer-portal residents (app end-users) from B2B customers.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "isPortalResident" BOOLEAN NOT NULL DEFAULT false;
-- Backfill: any customer that already has a portal login or a unit is a resident.
UPDATE "customers" c SET "isPortalResident" = true
WHERE EXISTS (SELECT 1 FROM "users" u WHERE u."customerId" = c.id)
   OR EXISTS (SELECT 1 FROM "customer_units" cu WHERE cu."customerId" = c.id);
