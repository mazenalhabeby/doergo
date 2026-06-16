-- ============================================================================
-- Production schema changes from the dynamic-task-types + audit work.
-- These were applied to DEV via raw ALTER (not Prisma migration files), so they
-- must be run once against the PRODUCTION database before/with the deploy.
-- Idempotent — safe to run multiple times.
--
--   psql "$DATABASE_URL" -f prod-audit-changes.sql
-- (or pipe into the running Postgres container)
-- ============================================================================

-- 1. Per-status capabilities (editable from the Task Types manager).
ALTER TABLE workflow_statuses
  ADD COLUMN IF NOT EXISTS capabilities text[] NOT NULL DEFAULT '{}';

-- 2. Per-location attendance-by-day index (dashboard presence query).
CREATE INDEX IF NOT EXISTS "time_entries_locationId_clockInAt_idx"
  ON time_entries ("locationId", "clockInAt");

-- NOTE: workflow_statuses.capabilities backfill is optional in prod — empty
-- capabilities fall back to the shared per-status map at the API. Seed/edit the
-- real types from the Task Types admin page after deploy.
