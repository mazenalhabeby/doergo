-- Drop indexes that are a strict PREFIX of another index on the same table.
--
-- Postgres can serve a query filtering on the leading column(s) of a composite
-- index from that composite, so `(organizationId)` adds nothing that
-- `(organizationId, status)` does not already provide. What it does add is write
-- cost: every INSERT and every UPDATE that touches an indexed column maintains
-- each one, and these sit on the hottest write tables in the product — tasks,
-- task_events, time_entries.
--
-- Foreign keys are unaffected: a composite still covers the FK check on its
-- leading column, so cascading deletes do not fall back to a sequential scan.
--
-- DROP INDEX is a catalogue operation, not a rebuild — it takes a brief lock and
-- returns immediately regardless of table size. IF EXISTS so the migration is
-- idempotent and safe to re-run against a database where drift removed one early.

-- users: covered by (organizationId, role, isActive)
DROP INDEX IF EXISTS "users_organizationId_idx";

-- tasks: 6 of the 22 indexes on this table were prefixes of others
DROP INDEX IF EXISTS "tasks_organizationId_idx";              -- ⊂ (organizationId, status)
DROP INDEX IF EXISTS "tasks_organizationId_status_idx";       -- ⊂ (organizationId, status, createdAt)
DROP INDEX IF EXISTS "tasks_assignedToId_idx";                -- ⊂ (assignedToId, status)
DROP INDEX IF EXISTS "tasks_assignedToId_status_idx";         -- ⊂ (assignedToId, status, updatedAt)
DROP INDEX IF EXISTS "tasks_customerId_idx";                  -- ⊂ (customerId, createdAt)
DROP INDEX IF EXISTS "tasks_organizationId_source_idx";       -- ⊂ (organizationId, source, createdAt)

-- checklist_items: covered by (taskId, position)
DROP INDEX IF EXISTS "checklist_items_taskId_idx";

-- task_events: covered by (taskId, createdAt)
DROP INDEX IF EXISTS "task_events_taskId_idx";

-- service_reports: covered by (organizationId, completedAt)
DROP INDEX IF EXISTS "service_reports_organizationId_idx";

-- company_locations: covered by (organizationId, kind, name)
DROP INDEX IF EXISTS "company_locations_organizationId_idx";

-- time_entries: covered by (locationId, clockInAt) / (organizationId, clockInAt) / (status, nextRemindAt)
DROP INDEX IF EXISTS "time_entries_locationId_idx";
DROP INDEX IF EXISTS "time_entries_organizationId_idx";
DROP INDEX IF EXISTS "time_entries_status_idx";

-- time_off_requests: covered by (technicianId, status, startDate)
DROP INDEX IF EXISTS "time_off_requests_technicianId_idx";

-- invitations: covered by (organizationId, status)
DROP INDEX IF EXISTS "invitations_organizationId_idx";

-- join_requests: covered by (userId, organizationId, status)
DROP INDEX IF EXISTS "join_requests_userId_idx";

-- sprints: covered by (organizationId, status)
DROP INDEX IF EXISTS "sprints_organizationId_idx";

-- Slow-query visibility (see the postgres `command:` block in the prod compose).
-- Loading the library needs a restart; creating the extension is per-database and
-- belongs here so a fresh environment gets it without a manual step.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
