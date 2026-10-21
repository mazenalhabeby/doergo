-- Track when a due reminder was notified to its owner (idempotent notification sweep).
ALTER TABLE "customer_activities" ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "customer_activities_reminder_sweep_idx" ON "customer_activities" ("dueAt") WHERE "type" = 'REMINDER' AND "doneAt" IS NULL AND "notifiedAt" IS NULL;
