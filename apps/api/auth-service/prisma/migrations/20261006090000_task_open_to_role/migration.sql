-- A task open to a WORK role: whoever holds the role in the task's workspace may
-- take it (packages/shared/src/tasks/role-pool.ts). Additive: every existing
-- task keeps openRoleId NULL and behaves exactly as before.
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'OPENED_TO_ROLE';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'OFFERED';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'TAKEN';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'RETURNED_TO_ROLE';

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "openRoleId" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "openSpots" INTEGER;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "openSpotsLeft" INTEGER;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "openWave" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_openRoleId_fkey"
    FOREIGN KEY ("openRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "tasks_openRoleId_spaceId_idx" ON "tasks"("openRoleId", "spaceId");

ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "roleOfferWidenMin" INTEGER;
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "roleOfferAlertMin" INTEGER;
