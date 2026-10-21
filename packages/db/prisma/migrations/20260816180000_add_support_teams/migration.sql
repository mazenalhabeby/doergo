-- Support Teams + dynamic routing (Phase 1). Additive + idempotent.
-- New: SupportTeamRole enum, support_teams, support_team_members,
-- support_routing_rules; support_tickets.assignedTeamId; organizations.supportTeamId.

-- Enum (guarded — CREATE TYPE has no IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE "SupportTeamRole" AS ENUM ('MANAGER', 'AGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- support_teams
CREATE TABLE IF NOT EXISTS "support_teams" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_teams_pkey" PRIMARY KEY ("id")
);

-- support_team_members
CREATE TABLE IF NOT EXISTS "support_team_members" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "platformUserId" TEXT NOT NULL,
  "teamRole" "SupportTeamRole" NOT NULL DEFAULT 'AGENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_team_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "support_team_members_teamId_platformUserId_key"
  ON "support_team_members" ("teamId", "platformUserId");
CREATE INDEX IF NOT EXISTS "support_team_members_platformUserId_idx"
  ON "support_team_members" ("platformUserId");

-- support_routing_rules
CREATE TABLE IF NOT EXISTS "support_routing_rules" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  "conditions" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_routing_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "support_routing_rules_isActive_order_idx"
  ON "support_routing_rules" ("isActive", "order");

-- FKs (guarded)
DO $$ BEGIN
  ALTER TABLE "support_team_members"
    ADD CONSTRAINT "support_team_members_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "support_teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "support_routing_rules"
    ADD CONSTRAINT "support_routing_rules_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "support_teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- support_tickets.assignedTeamId + scoped-queue index
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "assignedTeamId" TEXT;
CREATE INDEX IF NOT EXISTS "support_tickets_assignedTeamId_status_idx"
  ON "support_tickets" ("assignedTeamId", "status");

-- organizations.supportTeamId (manual pin) + FK + index
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "supportTeamId" TEXT;
CREATE INDEX IF NOT EXISTS "organizations_supportTeamId_idx"
  ON "organizations" ("supportTeamId");
DO $$ BEGIN
  ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_supportTeamId_fkey"
    FOREIGN KEY ("supportTeamId") REFERENCES "support_teams" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
