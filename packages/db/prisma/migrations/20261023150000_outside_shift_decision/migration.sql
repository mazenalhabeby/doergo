-- Time worked outside the planned shift, decided once (docs/plans/time-counting-model.md, phase 3).
-- Additive: three nullable columns; NULL = not decided. Safe to re-run.
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "outsideDecidedAt" TIMESTAMP(3);
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "outsideDecidedById" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "outsideCountedMinutes" INTEGER;

-- Entries closed BEFORE this existed were judged under the old rules: they are marked decided
-- (outsideDecidedById NULL = "from before"), so the inbox asks only about work from today on and
-- does not fill every leader's inbox on the day it ships. Remove this statement to ask about the last
-- 31 days instead. Runs once per entry (only where nothing is recorded yet).
UPDATE "time_entries"
   SET "outsideDecidedAt" = COALESCE("clockOutAt", NOW())
 WHERE "outsideDecidedAt" IS NULL AND "status" = 'CLOCKED_OUT';
