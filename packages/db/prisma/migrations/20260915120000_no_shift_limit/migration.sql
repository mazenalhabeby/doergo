-- Clocking in with no shift: what a workspace allows.
--
-- ALLOW (today's behaviour, and every existing workspace's), LIMIT (up to
-- noShiftDailyMinutes a day, counted at every workspace), or SHIFT_ONLY.
-- A String rather than an enum so an unknown value falls back to ALLOW instead
-- of failing to deserialise — see noShiftAllowance in shared.
--
-- Additive: nothing changes until somebody chooses otherwise.
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "noShiftPolicy" TEXT NOT NULL DEFAULT 'ALLOW';
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "noShiftDailyMinutes" INTEGER NOT NULL DEFAULT 480;
