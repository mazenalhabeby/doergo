-- Apartments: resident is a MEMBER (staff) or a CLIENT (customer), no more team.
DROP INDEX IF EXISTS "customer_units_workerIds_idx";
ALTER TABLE "customer_units" DROP COLUMN IF EXISTS "workerIds";
ALTER TABLE "customer_units" ADD COLUMN IF NOT EXISTS "residentUserId" TEXT;
CREATE INDEX IF NOT EXISTS "customer_units_residentUserId_idx" ON "customer_units" ("residentUserId");
