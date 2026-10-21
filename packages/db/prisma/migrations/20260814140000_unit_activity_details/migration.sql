-- Apartment: flexible attributes + an activity timeline (notes + system events).
ALTER TABLE "customer_units" ADD COLUMN IF NOT EXISTS "details" JSONB;

CREATE TABLE IF NOT EXISTS "unit_activities" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "unitId"         TEXT NOT NULL,
  "type"           TEXT NOT NULL DEFAULT 'NOTE',
  "body"           TEXT,
  "authorId"       TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unit_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "unit_activities_unitId_createdAt_idx" ON "unit_activities" ("unitId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "unit_activities"
    ADD CONSTRAINT "unit_activities_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "customer_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
