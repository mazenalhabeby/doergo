-- Rests that plan themselves.
--
-- Additive, and inert until somebody creates a rule: an organization with no
-- BreakRule rows behaves exactly as it does today — breaks are taken when the
-- member decides, nothing is planned and nothing is asked.
--
-- Hand-authored and idempotent; the shadow database on this project is broken,
-- so `migrate dev` is never used and every statement must survive a re-run.

CREATE TABLE IF NOT EXISTS "break_rules" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "spaceId"         TEXT,
  "shiftId"         TEXT,
  "name"            TEXT NOT NULL,
  "trigger"         TEXT NOT NULL DEFAULT 'LOCAL_WINDOW',
  "afterMinutes"    INTEGER,
  "earliestLocal"   TEXT,
  "latestLocal"     TEXT,
  "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  "isPaid"          BOOLEAN NOT NULL DEFAULT false,
  "isRequired"      BOOLEAN NOT NULL DEFAULT true,
  "remind"          BOOLEAN NOT NULL DEFAULT true,
  "snoozeMin"       INTEGER NOT NULL DEFAULT 15,
  "maxSnoozes"      INTEGER,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "position"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "break_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "break_rules_organizationId_isActive_idx" ON "break_rules"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "break_rules_spaceId_isActive_idx"        ON "break_rules"("spaceId", "isActive");
CREATE INDEX IF NOT EXISTS "break_rules_shiftId_isActive_idx"        ON "break_rules"("shiftId", "isActive");

DO $$ BEGIN
  ALTER TABLE "break_rules" ADD CONSTRAINT "break_rules_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "break_rules" ADD CONSTRAINT "break_rules_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "break_rules" ADD CONSTRAINT "break_rules_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The plan, and the deadline the sweep actually indexes.
ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "unpaidBreakMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "breakPlan"          JSONB,
  ADD COLUMN IF NOT EXISTS "nextBreakRemindAt"  TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "time_entries_status_nextBreakRemindAt_idx"
  ON "time_entries"("status", "nextBreakRemindAt");

-- Every break that exists today is unpaid: that is precisely what the reports
-- have always assumed by subtracting `breakMinutes` wholesale. Copying the total
-- across keeps every historic figure identical to the minute.
UPDATE "time_entries" SET "unpaidBreakMinutes" = COALESCE("breakMinutes", 0)
WHERE "unpaidBreakMinutes" = 0 AND COALESCE("breakMinutes", 0) > 0;

ALTER TABLE "breaks"
  ADD COLUMN IF NOT EXISTS "ruleId" TEXT,
  ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT false;
