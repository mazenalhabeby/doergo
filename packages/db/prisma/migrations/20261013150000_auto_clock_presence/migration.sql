-- The automatic clock for people with no fixed shift: clock by arriving and leaving.
-- Additive: every existing assignment stays on SHIFT (today's behaviour).
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "autoClockMode" TEXT NOT NULL DEFAULT 'SHIFT';
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "autoClockStartWindow" JSONB;
