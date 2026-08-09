-- One-off backfill: arm the reminder safety-net on sessions that were left OPEN
-- before the unscheduled-reminder fix shipped. Those entries have no expected end
-- and no nextRemindAt, so the reminder sweep never touched them (the "71h" bug).
--
-- Set nextRemindAt = clockInAt + 8h so the existing indexed sweep picks them up on
-- its next tick (for sessions already older than 8h this is in the past → handled
-- immediately: the worker is nudged, then it escalates to the responsible leader).
--
-- Idempotent + safe: only touches OPEN, UNSCHEDULED (no expectedClockOutAt) entries
-- that aren't already armed. Re-running is a no-op. Never closes anyone out.
UPDATE "time_entries"
SET "nextRemindAt" = "clockInAt" + interval '8 hours'
WHERE "status" = 'CLOCKED_IN'
  AND "nextRemindAt" IS NULL
  AND "expectedClockOutAt" IS NULL;
