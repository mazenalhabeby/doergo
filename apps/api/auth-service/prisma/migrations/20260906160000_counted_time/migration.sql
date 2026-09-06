-- Two clocks on one record.
--
-- `clockInAt`/`clockOutAt` stay exactly as they are: evidence, never adjusted.
-- These columns are the same day as payroll sees it — the part of it the
-- organization asked for and agreed to pay.
--
-- Hand-authored and idempotent: the shadow database on this project is broken,
-- so `migrate dev` is never used and every statement must survive a re-run.

ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "expectedClockInAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "countedStartAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "countedEndAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paidMinutes"       INTEGER;

-- Backfill every closed entry with EXACTLY what the reports already say:
-- total minus breaks, floored at zero. That expression is what
-- analytics/registry.ts computes in SQL on every export today, so no number
-- moves anywhere on the day this deploys — the figure simply stops being
-- recomputed and starts being stored.
--
-- Counted start/end are left NULL on historic rows on purpose: they were never
-- clamped, so inventing boundaries for them would be a claim about a day nobody
-- observed. A null there reads as "before this rule existed", which is true.
UPDATE "time_entries"
SET "paidMinutes" = GREATEST(COALESCE("totalMinutes", 0) - COALESCE("breakMinutes", 0), 0)
WHERE "paidMinutes" IS NULL
  AND "clockOutAt" IS NOT NULL;
