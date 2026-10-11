-- The leave ledger (packages/shared/src/leave/leave-ledger.ts).
-- A vacation balance becomes allowance + stored ADJUSTMENTS − approved vacation in the LEAVE YEAR.
-- Only adjustments are stored (used before HBCField, carried over, expired, corrections, grants).
--
-- Additive and idempotent: a new table, three enums and five organization columns whose defaults
-- (CALENDAR year, no carry-over) are exactly the behaviour from before — nothing reads differently
-- until an organization changes them or writes a line.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeaveAdjustmentKind') THEN
    CREATE TYPE "LeaveAdjustmentKind" AS ENUM ('OPENING_USED', 'CARRY_OVER', 'CARRY_EXPIRED', 'CORRECTION', 'GRANT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeaveYearMode') THEN
    CREATE TYPE "LeaveYearMode" AS ENUM ('CALENDAR', 'WORK_YEAR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CarryOverMode') THEN
    CREATE TYPE "CarryOverMode" AS ENUM ('NONE', 'UP_TO', 'ALL');
  END IF;
END $$;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "leaveYearMode" "LeaveYearMode" NOT NULL DEFAULT 'CALENDAR',
  ADD COLUMN IF NOT EXISTS "carryOverMode" "CarryOverMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "carryOverMaxDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "carryExpiresAfterMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "leaveTrackingStartedOn" DATE;

CREATE TABLE IF NOT EXISTS "leave_adjustments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "LeaveAdjustmentKind" NOT NULL,
  "days" DOUBLE PRECISION NOT NULL,
  "leaveYearStart" DATE NOT NULL,
  "reason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "voidedById" TEXT,
  "sourceKey" TEXT,
  CONSTRAINT "leave_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "leave_adjustments_sourceKey_key" ON "leave_adjustments"("sourceKey");
CREATE INDEX IF NOT EXISTS "leave_adjustments_organizationId_userId_leaveYearStart_idx"
  ON "leave_adjustments"("organizationId", "userId", "leaveYearStart");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_adjustments_organizationId_fkey') THEN
    ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_adjustments_userId_fkey') THEN
    ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_adjustments_createdById_fkey') THEN
    ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_adjustments_voidedById_fkey') THEN
    ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_voidedById_fkey"
      FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
