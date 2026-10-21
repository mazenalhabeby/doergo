-- Additive performance indexes (audit H1 + L6). Both idempotent.
--
-- H1: the nightly LocationHistory retention sweep filters on `timestamp` alone
-- (no user/task prefix), so it fell back to a full table scan. Index it.
--
-- L6: the suggested-technician capacity query aggregates COMPLETED/CLOSED tasks
-- per assignee over a 30-day `updatedAt` window; the existing
-- (assignedToId, status) index still heap-visited every lifetime completion to
-- apply the date filter. Add updatedAt to keep the range in the index.
--
-- NOTE for prod: on an already-large table Prisma's plain CREATE INDEX takes a
-- write lock for the duration of the build. If tasks/location_history are large
-- at deploy time, run these as CREATE INDEX CONCURRENTLY out-of-band instead
-- (CONCURRENTLY cannot run inside Prisma's migration transaction).
CREATE INDEX IF NOT EXISTS "location_history_timestamp_idx" ON "location_history" ("timestamp");

CREATE INDEX IF NOT EXISTS "tasks_assignedToId_status_updatedAt_idx" ON "tasks" ("assignedToId", "status", "updatedAt");
