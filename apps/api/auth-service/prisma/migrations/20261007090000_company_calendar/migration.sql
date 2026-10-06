-- The company calendar (packages/shared/src/calendar). Additive: every organization keeps a
-- Saturday+Sunday weekend and its country's holidays; every workspace inherits; existing leave
-- rows keep workingDays NULL and are counted on read.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "weekendDays" INTEGER[] NOT NULL DEFAULT ARRAY[0, 6]::INTEGER[];
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "holidayCountry" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "holidayRegion" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "calendarFeedsEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "weekendDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "holidayCountry" TEXT;
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "holidayRegion" TEXT;

ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "workingDays" DOUBLE PRECISION;

DO $$ BEGIN CREATE TYPE "CalendarEventKind" AS ENUM ('APPOINTMENT', 'REMINDER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CalendarVisibility" AS ENUM ('BUSY', 'DETAILS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CalendarRsvp" AS ENUM ('PENDING', 'ACCEPTED', 'MAYBE', 'DECLINED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "calendar_holidays" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId" TEXT,
  "libraryKey" TEXT,
  "date" DATE NOT NULL,
  "days" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL,
  "halfDay" BOOLEAN NOT NULL DEFAULT false,
  "removed" BOOLEAN NOT NULL DEFAULT false,
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_holidays_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "calendar_holidays_organizationId_spaceId_date_idx" ON "calendar_holidays"("organizationId", "spaceId", "date");
DO $$ BEGIN
  ALTER TABLE "calendar_holidays" ADD CONSTRAINT "calendar_holidays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "calendar_holidays" ADD CONSTRAINT "calendar_holidays_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "calendar_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId" TEXT,
  "createdById" TEXT NOT NULL,
  "kind" "CalendarEventKind" NOT NULL DEFAULT 'APPOINTMENT',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "meetingUrl" TEXT,
  "customerId" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "timezone" TEXT NOT NULL,
  "repeat" JSONB,
  "seriesEndAt" TIMESTAMP(3),
  "reminderOffsets" INTEGER[] DEFAULT ARRAY[10]::INTEGER[],
  "visibility" "CalendarVisibility" NOT NULL DEFAULT 'BUSY',
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "calendar_events_organizationId_startAt_idx" ON "calendar_events"("organizationId", "startAt");
CREATE INDEX IF NOT EXISTS "calendar_events_createdById_idx" ON "calendar_events"("createdById");
DO $$ BEGIN
  ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "calendar_attendees" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
  "response" "CalendarRsvp" NOT NULL DEFAULT 'PENDING',
  "respondedAt" TIMESTAMP(3),
  "nextRemindAt" TIMESTAMP(3),
  "remindOccurrence" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_attendees_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_attendees_eventId_userId_key" ON "calendar_attendees"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "calendar_attendees_userId_idx" ON "calendar_attendees"("userId");
CREATE INDEX IF NOT EXISTS "calendar_attendees_nextRemindAt_idx" ON "calendar_attendees"("nextRemindAt");
DO $$ BEGIN
  ALTER TABLE "calendar_attendees" ADD CONSTRAINT "calendar_attendees_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "calendar_attendees" ADD CONSTRAINT "calendar_attendees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "calendar_feed_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "calendar_feed_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_feed_tokens_userId_key" ON "calendar_feed_tokens"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_feed_tokens_tokenHash_key" ON "calendar_feed_tokens"("tokenHash");
DO $$ BEGIN
  ALTER TABLE "calendar_feed_tokens" ADD CONSTRAINT "calendar_feed_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
