-- Perf indexes (audit P3 + P8). Additive, idempotent.
-- P3: approval queue filters organizationId + approvalStatus='PENDING' ordered by
--     clockInAt desc; no composite existed, so it scanned AUTO-dominated history.
CREATE INDEX IF NOT EXISTS "time_entries_organizationId_approvalStatus_clockInAt_idx"
  ON "time_entries" ("organizationId", "approvalStatus", "clockInAt");

-- P8: the no-show sweep looks up approved leave per worker; only [technicianId] and
--     [status] standalone existed, forcing a wide scan + O(n) filter.
CREATE INDEX IF NOT EXISTS "time_off_requests_technicianId_status_startDate_idx"
  ON "time_off_requests" ("technicianId", "status", "startDate");
