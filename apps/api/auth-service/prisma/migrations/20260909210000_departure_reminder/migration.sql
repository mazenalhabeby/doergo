-- "Leave now" has been said once, for this job.
--
-- The sweep that tells a member to set off runs every few minutes, so it needs
-- to know which jobs it has already spoken about. A column rather than a Redis
-- key for the same reason `nextBreakRemindAt` is one: the sweep's whole cost is
-- the question "what is due", and that has to be answered by an index, not by
-- reading every task and asking a cache about each.
--
-- Cleared whenever the due date moves, so rescheduling a job re-arms the nudge.
--
-- Additive and idempotent; the shadow database is broken here, so migrations
-- are hand-authored and must be safe to re-run.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "departureNotifiedAt" TIMESTAMP(3);

-- The sweep's own query: timed jobs, today, not yet spoken about. Partial, so
-- the index holds only the handful of rows that are still candidates rather
-- than every task ever created.
CREATE INDEX IF NOT EXISTS "tasks_departure_sweep_idx"
  ON "tasks" ("dueDate")
  WHERE "departureNotifiedAt" IS NULL AND "assignedToId" IS NOT NULL;
