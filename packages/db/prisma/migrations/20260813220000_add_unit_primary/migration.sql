-- A customer's addresses = CustomerUnits; mark one as the PRIMARY (shown on map).
ALTER TABLE "customer_units" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;
