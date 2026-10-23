-- Time worked outside the planned shift, decided once (docs/plans/time-counting-model.md, phase 3).
-- Additive: three nullable columns; NULL = not decided. Safe to re-run.
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "outsideDecidedAt" TIMESTAMP(3);
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "outsideDecidedById" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "outsideCountedMinutes" INTEGER;
