-- Additive index (audit P10). The per-member recent-activity query filters
-- task_events by userId and sorts by createdAt; without this it was a filtered
-- sort with no supporting index. Idempotent.
-- NOTE for prod: on a large table use CREATE INDEX CONCURRENTLY out-of-band.
CREATE INDEX IF NOT EXISTS "task_events_userId_createdAt_idx" ON "task_events" ("userId", "createdAt");
