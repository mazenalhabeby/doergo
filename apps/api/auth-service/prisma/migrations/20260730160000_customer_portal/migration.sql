-- Customer Portal (B2B2C): CUSTOMER role, units, dynamic intake, portal task source.
-- Idempotent by design (ADD VALUE / COLUMN / TABLE / INDEX IF NOT EXISTS, guarded
-- constraints) so it applies cleanly even against a prod DB with prior drift.

-- 1) Role enum: external customer persona
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CUSTOMER';

-- 2) Organization: opt-in flag + portal config (entityLabel/features/brand)
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "customerPortalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "customerPortalConfig" JSONB;

-- 3) User: portal login link (customer + optional default unit)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "unitId" TEXT;

-- 4) Task: origin + optional unit link
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "unitId" TEXT;

-- 4b) Invitation: customer-portal invite target (Customer + optional unit)
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "unitId" TEXT;

-- 5) CustomerUnit
CREATE TABLE IF NOT EXISTS "customer_units" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "spaceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_units_pkey" PRIMARY KEY ("id")
);

-- 6) IntakeCategory
CREATE TABLE IF NOT EXISTS "intake_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "team" TEXT,
    "defaultPriority" TEXT,
    "issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "spaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "intake_categories_pkey" PRIMARY KEY ("id")
);

-- Indexes
-- NOTE (prod): the three new "tasks" indexes below build with a SHARE lock that
-- briefly blocks writes to "tasks". ADD COLUMN source/unitId are metadata-only
-- (PG11+), so the only cost here is the index builds. If the prod "tasks" table
-- is very large, create these three CONCURRENTLY as a post-deploy step instead
-- (CONCURRENTLY cannot run inside this migration's transaction). Otherwise deploy
-- at a low-traffic window.
CREATE INDEX IF NOT EXISTS "users_customerId_idx" ON "users"("customerId");
CREATE INDEX IF NOT EXISTS "tasks_unitId_idx" ON "tasks"("unitId");
CREATE INDEX IF NOT EXISTS "tasks_organizationId_source_idx" ON "tasks"("organizationId", "source");
CREATE INDEX IF NOT EXISTS "tasks_customerId_createdAt_idx" ON "tasks"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "customer_units_organizationId_isActive_idx" ON "customer_units"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "customer_units_customerId_idx" ON "customer_units"("customerId");
CREATE INDEX IF NOT EXISTS "customer_units_spaceId_idx" ON "customer_units"("spaceId");
CREATE INDEX IF NOT EXISTS "intake_categories_organizationId_isActive_idx" ON "intake_categories"("organizationId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "intake_categories_organizationId_key_key" ON "intake_categories"("organizationId", "key");

-- Foreign keys (guarded: ADD CONSTRAINT has no IF NOT EXISTS in Postgres)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_customerId_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_unitId_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "customer_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_unitId_fkey') THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "customer_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_units_organizationId_fkey') THEN
    ALTER TABLE "customer_units" ADD CONSTRAINT "customer_units_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_units_customerId_fkey') THEN
    ALTER TABLE "customer_units" ADD CONSTRAINT "customer_units_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_units_spaceId_fkey') THEN
    ALTER TABLE "customer_units" ADD CONSTRAINT "customer_units_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intake_categories_organizationId_fkey') THEN
    ALTER TABLE "intake_categories" ADD CONSTRAINT "intake_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intake_categories_spaceId_fkey') THEN
    ALTER TABLE "intake_categories" ADD CONSTRAINT "intake_categories_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
