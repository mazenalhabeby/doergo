-- Per-shift tolerance (minutes) before flagging LATE_ARRIVAL / EARLY_DEPARTURE /
-- OVERTIME — replaces the hardcoded 30-minute constant with a dynamic, per-shift
-- value. Additive & idempotent. Default 10.

ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "flagToleranceMin" INTEGER NOT NULL DEFAULT 10;
