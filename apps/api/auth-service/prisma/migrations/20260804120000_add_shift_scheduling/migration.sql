-- Space-centric shift scheduling foundation (Phase 0).
-- Adds: WorkModel on spaces, Shift definitions, ShiftAssignment rota,
-- dynamic per-space sub-roles (SpaceRole + SpaceMember), and shift-expectation
-- fields on time entries for the reminder engine.
-- Fully additive + idempotent (guarded) for prod-drift safety.

-- ── Enums (guarded so re-runs / prior drift don't error) ──
DO $$ BEGIN
  CREATE TYPE "WorkModel" AS ENUM ('NONE', 'SHIFT', 'FIXED', 'TASK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ShiftReminderState" AS ENUM ('NONE', 'REMINDED', 'OVERTIME_PENDING', 'OVERTIME_APPROVED', 'ESCALATED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ShiftRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ONE_OFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Space work model ──
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "workModel" "WorkModel" NOT NULL DEFAULT 'NONE';

-- ── Shift-expectation fields on time entries ──
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "shiftId" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "expectedClockOutAt" TIMESTAMP(3);
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "reminderState" "ShiftReminderState" NOT NULL DEFAULT 'NONE';
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "nextRemindAt" TIMESTAMP(3);
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "reminderCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "time_entries_status_nextRemindAt_idx" ON "time_entries" ("status", "nextRemindAt");

-- ── Shifts ──
CREATE TABLE IF NOT EXISTS "shifts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT DEFAULT '#3b82f6',
  "startLocal" TEXT NOT NULL,
  "endLocal" TEXT NOT NULL,
  "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "graceMin" INTEGER NOT NULL DEFAULT 5,
  "reminderIntervalMin" INTEGER NOT NULL DEFAULT 5,
  "maxReminders" INTEGER NOT NULL DEFAULT 3,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shifts_organizationId_idx" ON "shifts" ("organizationId");
CREATE INDEX IF NOT EXISTS "shifts_spaceId_idx" ON "shifts" ("spaceId");

-- ── Shift assignments (rota) ──
CREATE TABLE IF NOT EXISTS "shift_assignments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "recurrence" "ShiftRecurrence" NOT NULL DEFAULT 'WEEKLY',
  "daysOfWeek" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "daysOfMonth" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "dates" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[],
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shift_assignments_userId_spaceId_isActive_idx" ON "shift_assignments" ("userId", "spaceId", "isActive");
CREATE INDEX IF NOT EXISTS "shift_assignments_spaceId_idx" ON "shift_assignments" ("spaceId");
CREATE INDEX IF NOT EXISTS "shift_assignments_organizationId_idx" ON "shift_assignments" ("organizationId");

-- ── Dynamic per-space sub-roles ──
CREATE TABLE IF NOT EXISTS "space_roles" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT DEFAULT '#6b7280',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "permissions" JSONB NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "space_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "space_roles_organizationId_slug_key" ON "space_roles" ("organizationId", "slug");
CREATE INDEX IF NOT EXISTS "space_roles_organizationId_idx" ON "space_roles" ("organizationId");

-- ── Space membership + sub-role assignment ──
CREATE TABLE IF NOT EXISTS "space_members" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "spaceRoleId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "space_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "space_members_userId_spaceId_key" ON "space_members" ("userId", "spaceId");
CREATE INDEX IF NOT EXISTS "space_members_spaceId_idx" ON "space_members" ("spaceId");
CREATE INDEX IF NOT EXISTS "space_members_organizationId_idx" ON "space_members" ("organizationId");
CREATE INDEX IF NOT EXISTS "space_members_spaceRoleId_idx" ON "space_members" ("spaceRoleId");

-- ── Foreign keys (guarded so re-runs / prior drift don't error) ──
DO $$ BEGIN
  ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "shifts" ADD CONSTRAINT "shifts_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "space_roles" ADD CONSTRAINT "space_roles_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "space_members" ADD CONSTRAINT "space_members_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "space_members" ADD CONSTRAINT "space_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "space_members" ADD CONSTRAINT "space_members_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "space_members" ADD CONSTRAINT "space_members_spaceRoleId_fkey"
    FOREIGN KEY ("spaceRoleId") REFERENCES "space_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
