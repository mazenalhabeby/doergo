-- Office rules on approvals (a threshold → a second step) and the recorded first steps. Additive only.
CREATE TABLE IF NOT EXISTS "approval_rules" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "spaceId" TEXT,
  "minMinutes" INTEGER,
  "minDays" INTEGER,
  "minAmountCents" INTEGER,
  "secondRoleId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "approval_rules_organizationId_kind_idx" ON "approval_rules"("organizationId", "kind");
DO $$ BEGIN
  ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "approval_steps" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "firstById" TEXT NOT NULL,
  "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "minutes" INTEGER,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "approval_steps_organizationId_kind_itemId_idx" ON "approval_steps"("organizationId", "kind", "itemId");
-- At most one OPEN first step per item: two people approving first at once cannot both "go first".
CREATE UNIQUE INDEX IF NOT EXISTS "approval_steps_open_item_key" ON "approval_steps"("organizationId", "kind", "itemId") WHERE "consumedAt" IS NULL;
