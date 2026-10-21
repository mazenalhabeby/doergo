-- The home Crew card: rests still running, and no-shows in a time window.
-- Both queries scanned their whole table. Additive and idempotent.
CREATE INDEX IF NOT EXISTS "breaks_endedAt_idx" ON "breaks"("endedAt");
CREATE INDEX IF NOT EXISTS "shift_instances_organizationId_expectedClockInAt_idx"
  ON "shift_instances"("organizationId", "expectedClockInAt");
