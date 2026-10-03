-- A crew's checklist: whose item it is, and who ticked it when (shared tasks/checklist.ts).
-- Additive only: every existing item keeps reading as it did (no owner, ticked by nobody named).
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'CHECKLIST_ITEM_ASSIGNED';

ALTER TABLE "checklist_items" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT;
ALTER TABLE "checklist_items" ADD COLUMN IF NOT EXISTS "completedById" TEXT;
ALTER TABLE "checklist_items" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_completedById_fkey"
    FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "checklist_items_assigneeId_isCompleted_taskId_idx" ON "checklist_items"("assigneeId", "isCompleted", "taskId");
CREATE INDEX IF NOT EXISTS "checklist_items_completedById_idx" ON "checklist_items"("completedById");
