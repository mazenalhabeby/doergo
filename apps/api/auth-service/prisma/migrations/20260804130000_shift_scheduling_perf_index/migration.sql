-- Perf: index for the "pending extra-time" lookup (listPendingExtraTime), which
-- filters time_entries by organizationId + reminderState (status CLOCKED_IN).
-- Additive + idempotent.
CREATE INDEX IF NOT EXISTS "time_entries_organizationId_reminderState_idx"
  ON "time_entries" ("organizationId", "reminderState");
