-- A shift left open, closed with a temporary time.
--
-- Nothing was ever closed automatically, so a forgotten clock-out left the shift
-- open for days — and, with one open shift per member, blocked the next
-- clock-in. A sweep now closes it with the best evidence (the moment the member
-- left the site, the shift end, or clock-in + 8h) and marks it provisional; the
-- member's real clock-out, or their answer to "when did you leave?", replaces it.
--
-- Additive: existing shifts are not provisional.
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "clockOutProvisional" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "clockOutBasis" TEXT;

-- The sweep's two questions, each answered by a small PARTIAL index over open
-- shifts only (Prisma cannot express these, so they are not in schema.prisma):
--   planned shifts whose end passed long ago, and unplanned ones open too long.
CREATE INDEX IF NOT EXISTS "time_entries_open_expected_end"
  ON "time_entries" ("expectedClockOutAt") WHERE "status" = 'CLOCKED_IN' AND "expectedClockOutAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "time_entries_open_unplanned_since"
  ON "time_entries" ("clockInAt") WHERE "status" = 'CLOCKED_IN' AND "expectedClockOutAt" IS NULL;

-- "When did you leave?" asks about the member's latest provisional shift.
CREATE INDEX IF NOT EXISTS "time_entries_provisional_by_user"
  ON "time_entries" ("userId", "clockOutAt") WHERE "clockOutProvisional" = true;

-- Overtime a manager added to a closed shift, recorded as its own approval method.
ALTER TYPE "OvertimeApprovalMethod" ADD VALUE IF NOT EXISTS 'MANAGER';
