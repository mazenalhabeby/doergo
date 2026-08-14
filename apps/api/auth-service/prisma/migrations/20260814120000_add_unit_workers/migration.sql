-- Apartments module: staff assigned to a unit + fast "units for a worker" lookup.
ALTER TABLE "customer_units" ADD COLUMN IF NOT EXISTS "workerIds" TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS "customer_units_workerIds_idx" ON "customer_units" USING GIN ("workerIds");
