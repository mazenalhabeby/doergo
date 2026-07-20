-- Saved report definitions (custom report builder, Pro+). Additive + idempotent.
CREATE TABLE IF NOT EXISTS "report_definitions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "dataset" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "isShared" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "report_definitions_organizationId_createdAt_idx" ON "report_definitions" ("organizationId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
