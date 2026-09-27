-- Step forms: "Ask when a job moves here".
--
-- A workflow step may carry a FORM (`workflow_statuses.form`, JSON: version +
-- fields). Moving a job into that step stores the answers as ONE row in
-- `task_step_submissions`, with the definition snapshotted beside them.
--
-- Additive and idempotent throughout: the shadow database is broken here, so
-- migrations are hand-authored and must be safe to re-run. NULL form = not set,
-- so every existing workflow behaves exactly as before.

ALTER TABLE "workflow_statuses" ADD COLUMN IF NOT EXISTS "form" JSONB;

CREATE TABLE IF NOT EXISTS "task_step_submissions" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId"         TEXT NOT NULL,
    "statusKey"      TEXT NOT NULL,
    "formVersion"    INTEGER NOT NULL,
    "form"           JSONB NOT NULL,
    "answers"        JSONB NOT NULL,
    "submittedById"  TEXT NOT NULL,
    "submittedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_step_submissions_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    ALTER TABLE "task_step_submissions"
        ADD CONSTRAINT "task_step_submissions_taskId_fkey"
        FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A job's report section reads its submissions in order.
CREATE INDEX IF NOT EXISTS "task_step_submissions_taskId_submittedAt_idx" ON "task_step_submissions"("taskId", "submittedAt");
CREATE INDEX IF NOT EXISTS "task_step_submissions_organizationId_idx" ON "task_step_submissions"("organizationId");
