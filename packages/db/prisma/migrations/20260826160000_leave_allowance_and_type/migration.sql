-- Leave allowance, and the absence TYPE that makes an allowance meaningful.
--
-- Hand-authored and idempotent: the shadow database this project would need to
-- generate a migration is broken by an old one, and production schema has
-- drifted before, so every statement has to survive being applied twice.

-- ── The kind of absence ─────────────────────────────────────────────────────
-- An allowance that deducts sick days is not an allowance. Only VACATION is
-- counted against it, which requires knowing the kind — until now that lived in
-- a free-text `reason` and could not be read reliably.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TimeOffType') THEN
    CREATE TYPE "TimeOffType" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'OTHER');
  END IF;
END $$;

ALTER TABLE "time_off_requests"
  ADD COLUMN IF NOT EXISTS "type" "TimeOffType" NOT NULL DEFAULT 'VACATION';

-- ── Backfill from the reason text ───────────────────────────────────────────
-- Requests written by the apps start with a known label ("Sick Leave: ...").
-- Anything unrecognised stays VACATION, which is the honest default: it is what
-- the column meant implicitly before this existed, so nobody's history changes
-- shape. It also errs toward deducting rather than silently granting extra
-- days, and a manager can correct a single record.
UPDATE "time_off_requests" SET "type" = 'SICK'
  WHERE "type" = 'VACATION' AND "reason" ~* '(sick|krank|malad|enferm|malatt)';
UPDATE "time_off_requests" SET "type" = 'PERSONAL'
  WHERE "type" = 'VACATION' AND "reason" ~* '(personal|persönlich|personnel|personale)';
UPDATE "time_off_requests" SET "type" = 'OTHER'
  WHERE "type" = 'VACATION' AND "reason" ~* '^(other|sonstiges|otro|autre|altro)';

-- ── The allowance ───────────────────────────────────────────────────────────
-- 25 days is the statutory minimum for a full-time employee in Austria, where
-- this organization is based, so it is the least surprising default rather than
-- an arbitrary number.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "defaultLeaveAllowance" INTEGER NOT NULL DEFAULT 25;

-- Null means "use the organization's default" — distinct from 0, which means
-- this person genuinely has no paid leave.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "leaveAllowance" INTEGER;

-- Balance is computed per person per year over approved vacation.
CREATE INDEX IF NOT EXISTS "time_off_requests_technicianId_type_status_idx"
  ON "time_off_requests" ("technicianId", "type", "status");
