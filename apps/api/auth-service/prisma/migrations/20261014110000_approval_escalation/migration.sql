-- Approval rules: the cover condition, reminders and escalation when nobody answers. Additive only.
ALTER TABLE "approval_rules" ADD COLUMN IF NOT EXISTS "whenCoverShort" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "approval_rules" ADD COLUMN IF NOT EXISTS "remindAfterHours" INTEGER;
ALTER TABLE "approval_rules" ADD COLUMN IF NOT EXISTS "escalateAfterHours" INTEGER;
ALTER TABLE "approval_rules" ADD COLUMN IF NOT EXISTS "escalateRoleId" TEXT;
ALTER TABLE "approval_rules" ALTER COLUMN "secondRoleId" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "approval_notices" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_notices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "approval_notices_kind_itemId_stage_key" ON "approval_notices"("kind", "itemId", "stage");
CREATE INDEX IF NOT EXISTS "approval_notices_organizationId_idx" ON "approval_notices"("organizationId");
