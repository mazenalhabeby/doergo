-- No-show engine: materialized expected shift occurrences + a per-member timezone
-- fallback (for logical-space no-shows where there's no GPS to derive tz from).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" TEXT;

CREATE TABLE IF NOT EXISTS "shift_instances" (
  "id"                 TEXT NOT NULL,
  "organizationId"     TEXT NOT NULL,
  "spaceId"            TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "shiftId"            TEXT NOT NULL,
  "localDate"          TEXT NOT NULL,
  "expectedClockInAt"  TIMESTAMP(3) NOT NULL,
  "expectedClockOutAt" TIMESTAMP(3) NOT NULL,
  "state"              TEXT NOT NULL DEFAULT 'PENDING',
  "reminderCount"      INTEGER NOT NULL DEFAULT 0,
  "nextRemindAt"       TIMESTAMP(3),
  "timeEntryId"        TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shift_instances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shift_instances_userId_spaceId_shiftId_localDate_key"
  ON "shift_instances" ("userId", "spaceId", "shiftId", "localDate");
CREATE INDEX IF NOT EXISTS "shift_instances_state_nextRemindAt_idx"
  ON "shift_instances" ("state", "nextRemindAt");
CREATE INDEX IF NOT EXISTS "shift_instances_userId_localDate_idx"
  ON "shift_instances" ("userId", "localDate");
CREATE INDEX IF NOT EXISTS "shift_instances_organizationId_spaceId_localDate_idx"
  ON "shift_instances" ("organizationId", "spaceId", "localDate");
