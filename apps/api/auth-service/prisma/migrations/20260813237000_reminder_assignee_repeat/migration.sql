-- Per-reminder manager assignment + recurrence.
ALTER TABLE "customer_activities" ADD COLUMN IF NOT EXISTS "reminderAssigneeId" TEXT;
ALTER TABLE "customer_activities" ADD COLUMN IF NOT EXISTS "repeat" TEXT DEFAULT 'NONE';
