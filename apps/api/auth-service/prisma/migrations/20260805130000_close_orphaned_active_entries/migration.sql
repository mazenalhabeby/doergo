-- Heal time entries left CLOCKED_IN despite having a clock-out time. Before this
-- batch, editing a still-open entry to add a clock-out recomputed the duration but
-- never flipped `status`, so the row showed "Active" with a clock-out + duration
-- (the manual clock-out bug). The edit path now closes them going forward; this
-- backfills the ones already broken. A system AUTO_OUT already has its own status,
-- so it is untouched. Idempotent — only rows still mismatched are updated.
UPDATE "time_entries"
SET "status" = 'CLOCKED_OUT'
WHERE "status" = 'CLOCKED_IN'
  AND "clockOutAt" IS NOT NULL;
