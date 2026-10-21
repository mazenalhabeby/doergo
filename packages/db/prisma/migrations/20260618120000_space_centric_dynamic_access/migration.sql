-- Idempotent migration: prod has partial drift from earlier `db push` deploys,
-- so every statement is written to add only what's missing and skip what already
-- exists. Safe to run via `migrate deploy` against prod's real state.

-- Old unique (organizationId, key) on custom field definitions → replaced below.
DROP INDEX IF EXISTS "custom_field_definitions_organizationId_key_key";

-- ActivityLog.eventType enum -> text. In-place cast preserves existing audit
-- rows (enum -> text needs an explicit USING; text -> text is a harmless no-op).
ALTER TABLE "activity_logs" ALTER COLUMN "eventType" SET DATA TYPE TEXT USING "eventType"::text;

-- company_locations: spaces can be logical (no coords) + one default per org.
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_locations" ALTER COLUMN "lat" DROP NOT NULL;
ALTER TABLE "company_locations" ALTER COLUMN "lng" DROP NOT NULL;

-- custom_field_definitions: scope to a Task Type (workflowId) or global (null).
ALTER TABLE "custom_field_definitions" ADD COLUMN IF NOT EXISTS "workflowId" TEXT;

-- organizations: structured address.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "addressLine1" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "addressLine2" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "state" TEXT;

-- recurring_task_templates: generated tasks land in a space + carry a Task Type.
ALTER TABLE "recurring_task_templates" ADD COLUMN IF NOT EXISTS "spaceId" TEXT;
ALTER TABLE "recurring_task_templates" ADD COLUMN IF NOT EXISTS "workflowId" TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS "activity_logs_eventType_createdAt_idx" ON "activity_logs"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "custom_field_definitions_workflowId_idx" ON "custom_field_definitions"("workflowId");
CREATE UNIQUE INDEX IF NOT EXISTS "custom_field_definitions_organizationId_workflowId_key_key" ON "custom_field_definitions"("organizationId", "workflowId", "key");
CREATE INDEX IF NOT EXISTS "recurring_task_templates_spaceId_idx" ON "recurring_task_templates"("spaceId");
CREATE INDEX IF NOT EXISTS "recurring_task_templates_workflowId_idx" ON "recurring_task_templates"("workflowId");

-- Foreign keys (guarded — skip if already present)
DO $$ BEGIN
  ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "status_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "recurring_task_templates" ADD CONSTRAINT "recurring_task_templates_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "recurring_task_templates" ADD CONSTRAINT "recurring_task_templates_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "status_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
