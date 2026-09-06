-- Why somebody was away from the site. Optional, and read only by a person.
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "awayReason" TEXT;
