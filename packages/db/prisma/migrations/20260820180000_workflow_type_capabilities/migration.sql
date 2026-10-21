-- What a TASK TYPE carries throughout a task's life, as opposed to what a member
-- does at one step.
--
-- WorkflowStatus.capabilities already held the step-level ones (gps, timer,
-- photos…). Twelve of the eighteen modules could not be declared by a workflow
-- at all — a Project task type had no way to say it needs Sprints — so nothing
-- could warn that the module was off. This is where those live.
--
-- Idempotent: the shadow database is unusable here, so migrations are
-- hand-authored and must tolerate re-application.
ALTER TABLE "status_workflows"
  ADD COLUMN IF NOT EXISTS "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
