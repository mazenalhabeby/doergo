-- The session's planned end IS today's limit, not a shift end: leaving before it
-- is not an early departure, and past it reads "past today's limit".
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "endIsDailyLimit" BOOLEAN NOT NULL DEFAULT false;
