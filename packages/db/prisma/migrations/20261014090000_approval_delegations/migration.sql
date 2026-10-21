-- Approval stand-ins: a leader on leave hands their approval decisions to somebody for whole days.
-- Additive only.
CREATE TABLE IF NOT EXISTS "approval_delegations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  CONSTRAINT "approval_delegations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "approval_delegations_toUserId_endsOn_idx" ON "approval_delegations"("toUserId", "endsOn");
CREATE INDEX IF NOT EXISTS "approval_delegations_fromUserId_endsOn_idx" ON "approval_delegations"("fromUserId", "endsOn");
CREATE INDEX IF NOT EXISTS "approval_delegations_organizationId_idx" ON "approval_delegations"("organizationId");
DO $$ BEGIN
  ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
