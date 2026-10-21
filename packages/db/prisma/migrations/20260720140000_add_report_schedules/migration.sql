-- Scheduled report delivery (Business+). Additive + idempotent.
CREATE TABLE IF NOT EXISTS "report_schedules" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reportDefinitionId" TEXT NOT NULL,
  "cadence" TEXT NOT NULL,
  "hour" INTEGER NOT NULL DEFAULT 7,
  "dayOfWeek" INTEGER,
  "dayOfMonth" INTEGER,
  "recipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "report_schedules_isActive_nextRunAt_idx" ON "report_schedules" ("isActive", "nextRunAt");
CREATE INDEX IF NOT EXISTS "report_schedules_organizationId_idx" ON "report_schedules" ("organizationId");
CREATE INDEX IF NOT EXISTS "report_schedules_reportDefinitionId_idx" ON "report_schedules" ("reportDefinitionId");
DO $$ BEGIN
  ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_reportDefinitionId_fkey" FOREIGN KEY ("reportDefinitionId") REFERENCES "report_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
