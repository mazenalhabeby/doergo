-- Per-user report access — granted to Show-in-Management members via the Access
-- Builder toggle. Reports gate = admin OR canViewAllTasks OR canViewReports.
-- Backfill: managers (canViewAllTasks) already had report access, keep it.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "canViewReports" BOOLEAN NOT NULL DEFAULT false;
UPDATE "users" SET "canViewReports" = true WHERE "canViewAllTasks" = true AND "canViewReports" = false;
