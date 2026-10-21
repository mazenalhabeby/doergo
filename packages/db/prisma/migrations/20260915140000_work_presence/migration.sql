-- Where somebody on the clock is working now: ON_SITE | FIELD | REMOTE.
--
-- Decided on the server from evidence the phone already sends (the area,
-- job trips and arrivals, movement between heartbeats) and written ONLY when the
-- group changes — a handful of writes a day per person. Display only: nothing
-- that counts time reads it.
--
-- Additive. Existing entries have no group, and the dashboard keeps its old
-- reading for them.
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "presence" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "presenceReason" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "presenceAt" TIMESTAMP(3);
-- The last position heard, refreshed at most every 10 minutes: "No signal since …".
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

-- The day, one row per change.
-- ⚠️ The position of each change is kept HERE, not on time_entries: movement is
-- measured from it, and time entries are returned whole by many list reads. Only
-- the presence service reads these columns, with an explicit select.
CREATE TABLE IF NOT EXISTS "time_entry_presence" (
  "id" TEXT NOT NULL,
  "timeEntryId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL,
  "presence" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  -- Filled in from a batch the phone kept without signal.
  "sentLate" BOOLEAN NOT NULL DEFAULT false,
  "anchorLat" DOUBLE PRECISION,
  "anchorLng" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "time_entry_presence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "time_entry_presence_timeEntryId_at_idx" ON "time_entry_presence" ("timeEntryId", "at");
DO $$ BEGIN
  ALTER TABLE "time_entry_presence"
    ADD CONSTRAINT "time_entry_presence_timeEntryId_fkey"
    FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
