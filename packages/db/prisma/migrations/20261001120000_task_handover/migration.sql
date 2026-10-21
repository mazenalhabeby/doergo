-- Paused at clock-out, and the handover note.
--
-- A worker who clocked out with a job in a working step left it "running" with
-- nobody on it: the job's time kept counting overnight, and whoever was given
-- it next knew nothing of what had been done. The clock-out now pauses the job
-- at the clock-out minute, and asks the worker what they did and what is left.
--
-- Additive: no existing job is paused, nobody owes a note.
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'RESUMED';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'HANDOVER_ADDED';

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "pausedById" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "handoverDueById" TEXT;
CREATE INDEX IF NOT EXISTS "tasks_pausedById_idx" ON "tasks"("pausedById");
CREATE INDEX IF NOT EXISTS "tasks_handoverDueById_idx" ON "tasks"("handoverDueById");

CREATE TABLE IF NOT EXISTS "task_handovers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workedMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_handovers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "task_handovers_taskId_createdAt_idx" ON "task_handovers"("taskId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "task_handovers" ADD CONSTRAINT "task_handovers_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "task_handovers" ADD CONSTRAINT "task_handovers_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
