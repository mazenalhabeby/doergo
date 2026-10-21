-- How and where an appointment happens (in person at our office / client's site / an address, online, phone). Additive.
DO $$ BEGIN CREATE TYPE "CalendarMeetingMode" AS ENUM ('IN_PERSON', 'ONLINE', 'PHONE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CalendarPlaceKind" AS ENUM ('OFFICE', 'CLIENT_SITE', 'ADDRESS'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CalendarCallDirection" AS ENUM ('OUTGOING', 'INCOMING'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "meetingMode" "CalendarMeetingMode";
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "placeKind" "CalendarPlaceKind";
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "placeSpaceId" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "room" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "callDirection" "CalendarCallDirection";
DO $$ BEGIN
  ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_placeSpaceId_fkey" FOREIGN KEY ("placeSpaceId") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
