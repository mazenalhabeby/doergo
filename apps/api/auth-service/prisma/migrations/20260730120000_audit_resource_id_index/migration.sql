-- Per-entity audit trail index: WHERE "resourceId" = ? ORDER BY "createdAt" DESC.
-- Idempotent (prod schema may already carry ad-hoc indexes / drift).
CREATE INDEX IF NOT EXISTS "activity_logs_resourceId_createdAt_idx"
  ON "activity_logs" ("resourceId", "createdAt");
