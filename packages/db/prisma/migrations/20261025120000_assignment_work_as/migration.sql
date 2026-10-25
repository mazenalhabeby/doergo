-- How one member works at one workspace, when it differs from the workspace (clock review D1, 2026-10-25).
-- Additive: two nullable columns; NULL = the same as the workspace, so nothing changes until the office sets one.
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "workAs" TEXT;
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "workDailyMinutes" INTEGER;
