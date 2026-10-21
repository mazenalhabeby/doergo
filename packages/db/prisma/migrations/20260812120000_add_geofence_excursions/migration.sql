-- Geofence "out of ring" excursion workflow. Replaces the silent 150m auto
-- clock-out with a reason → approval → timed-grace state machine. Additive &
-- idempotent (shadow DB is broken in this repo). No backfill.

DO $$ BEGIN
  CREATE TYPE "GeofenceExcursionStatus" AS ENUM (
    'OUT_UNREPORTED', 'PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "geofence_excursions" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "timeEntryId"      TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "spaceId"          TEXT NOT NULL,
  "status"           "GeofenceExcursionStatus" NOT NULL DEFAULT 'OUT_UNREPORTED',
  "reason"           TEXT,
  "requestedMinutes" INTEGER,
  "grantedMinutes"   INTEGER,
  "leftRingAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportedAt"       TIMESTAMP(3),
  "decidedAt"        TIMESTAMP(3),
  "expiresAt"        TIMESTAMP(3),
  "resolvedAt"       TIMESTAMP(3),
  "approvedById"     TEXT,
  "timerExpired"     BOOLEAN NOT NULL DEFAULT false,
  "lastDistanceM"    INTEGER,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "geofence_excursions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "geofence_excursions_status_expiresAt_idx"
  ON "geofence_excursions" ("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "geofence_excursions_timeEntryId_idx"
  ON "geofence_excursions" ("timeEntryId");
CREATE INDEX IF NOT EXISTS "geofence_excursions_organizationId_status_idx"
  ON "geofence_excursions" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "geofence_excursions_userId_status_idx"
  ON "geofence_excursions" ("userId", "status");

DO $$ BEGIN
  ALTER TABLE "geofence_excursions"
    ADD CONSTRAINT "geofence_excursions_timeEntryId_fkey"
    FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
