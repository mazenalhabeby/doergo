-- Composite index for the "who is clocked in right now" org-wide lookup
-- (dashboard presence). Keeps it O(open entries) as history grows, independent
-- of clock-in date. Idempotent so it survives prod schema drift / re-runs.
CREATE INDEX IF NOT EXISTS "time_entries_organizationId_status_idx"
  ON "time_entries" ("organizationId", "status");
