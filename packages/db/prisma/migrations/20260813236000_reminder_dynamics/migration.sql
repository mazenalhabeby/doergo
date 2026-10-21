-- Dynamic reminders: purpose (kind), lead time, and computed fire time.
ALTER TABLE "customer_activities" ADD COLUMN IF NOT EXISTS "reminderKind" TEXT;
ALTER TABLE "customer_activities" ADD COLUMN IF NOT EXISTS "remindBeforeMin" INTEGER DEFAULT 0;
ALTER TABLE "customer_activities" ADD COLUMN IF NOT EXISTS "notifyAt" TIMESTAMP(3);

-- Existing reminders: fire at their due time (no lead) so the sweep still finds them.
UPDATE "customer_activities" SET "notifyAt" = "dueAt"
  WHERE "type" = 'REMINDER' AND "notifyAt" IS NULL AND "dueAt" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "customer_activities_notifyAt_idx" ON "customer_activities" ("notifyAt");
