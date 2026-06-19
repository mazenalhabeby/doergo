-- Invitation can pre-set the member's full schedule (type + weekly hours OR a
-- monthly budget), applied to the user on accept. Idempotent for prod-drift safety.
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "scheduleType" TEXT;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "schedule" JSONB;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "monthlyHourBudget" INTEGER;
