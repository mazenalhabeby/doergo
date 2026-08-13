-- CRM record: customer lifecycle status + activity timeline (notes, calls,
-- reminders, status changes). Additive + idempotent.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'LEAD';

DO $$ BEGIN
  CREATE TYPE "CustomerActivityType" AS ENUM ('NOTE','CALL','EMAIL','MEETING','REMINDER','STATUS','SYSTEM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "customer_activities" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId"     TEXT NOT NULL,
  "type"           "CustomerActivityType" NOT NULL DEFAULT 'NOTE',
  "body"           TEXT,
  "authorId"       TEXT,
  "dueAt"          TIMESTAMP(3),
  "doneAt"         TIMESTAMP(3),
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "customer_activities_customerId_createdAt_idx" ON "customer_activities" ("customerId","createdAt");
CREATE INDEX IF NOT EXISTS "customer_activities_organizationId_dueAt_idx" ON "customer_activities" ("organizationId","dueAt");

DO $$ BEGIN
  ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
