-- An administrator may switch their own clock off (clock review A7, 2026-10-25).
-- Additive: one column, false for everybody, so nothing changes until an admin chooses it. Safe to re-run.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clockOff" BOOLEAN NOT NULL DEFAULT false;
