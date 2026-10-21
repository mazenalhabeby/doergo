-- First-class Customer entity + optional links from tasks and service reports.
-- Idempotent + safe for prod drift.

CREATE TABLE IF NOT EXISTS "customers" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customers_organizationId_isActive_idx" ON "customers" ("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "customers_organizationId_name_idx" ON "customers" ("organizationId", "name");

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "service_reports" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

CREATE INDEX IF NOT EXISTS "tasks_customerId_idx" ON "tasks" ("customerId");
CREATE INDEX IF NOT EXISTS "service_reports_customerId_idx" ON "service_reports" ("customerId");

-- Foreign keys (guarded so re-runs / prior drift don't error).
DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
