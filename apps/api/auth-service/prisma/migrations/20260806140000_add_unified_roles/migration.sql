-- Unified role model (Phase 1). Adds ONE role entity for both org-wide and
-- per-space roles (AccessRole → "roles"), a merged space assignment table
-- (SpaceAssignment → "space_assignments"), and User.memberRoleId. Supersedes
-- OrgRole + SpaceRole + TechnicianAssignment + SpaceMember, which are kept
-- intact during migration (removed in Phase 5). Nothing reads these yet.
-- Fully additive + idempotent (guarded) for prod-drift safety.

-- ── Enum ──
DO $$ BEGIN
  CREATE TYPE "RoleScope" AS ENUM ('ORG', 'SPACE', 'BOTH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── roles (AccessRole) ──
CREATE TABLE IF NOT EXISTS "roles" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT DEFAULT '#6b7280',
  "scope" "RoleScope" NOT NULL DEFAULT 'BOTH',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "legacyKind" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "permissions" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "roles_organizationId_slug_key" ON "roles" ("organizationId", "slug");
CREATE INDEX IF NOT EXISTS "roles_organizationId_idx" ON "roles" ("organizationId");

DO $$ BEGIN
  ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── space_assignments (SpaceAssignment) ──
CREATE TABLE IF NOT EXISTS "space_assignments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "roleId" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "schedule" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "space_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "space_assignments_userId_spaceId_key" ON "space_assignments" ("userId", "spaceId");
CREATE INDEX IF NOT EXISTS "space_assignments_spaceId_idx" ON "space_assignments" ("spaceId");
CREATE INDEX IF NOT EXISTS "space_assignments_userId_idx" ON "space_assignments" ("userId");
CREATE INDEX IF NOT EXISTS "space_assignments_organizationId_idx" ON "space_assignments" ("organizationId");
CREATE INDEX IF NOT EXISTS "space_assignments_roleId_idx" ON "space_assignments" ("roleId");

DO $$ BEGIN
  ALTER TABLE "space_assignments" ADD CONSTRAINT "space_assignments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "space_assignments" ADD CONSTRAINT "space_assignments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "space_assignments" ADD CONSTRAINT "space_assignments_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "space_assignments" ADD CONSTRAINT "space_assignments_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── User.memberRoleId ──
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "memberRoleId" TEXT;
CREATE INDEX IF NOT EXISTS "users_memberRoleId_idx" ON "users" ("memberRoleId");

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_memberRoleId_fkey"
    FOREIGN KEY ("memberRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
