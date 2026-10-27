-- Every approval rule that applies counts (decided 2026-10-27): an item may need several second approvers.
-- Additive. Steps already open keep exactly their meaning: they need their own rule's role, and their first
-- approver already approved.
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "requiredRoleIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "doneRoleIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "approverIds" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "approval_steps" s
SET "requiredRoleIds" = ARRAY[r."secondRoleId"], "approverIds" = ARRAY[s."firstById"]
FROM "approval_rules" r
WHERE r."id" = s."ruleId" AND r."secondRoleId" IS NOT NULL AND s."consumedAt" IS NULL AND s."requiredRoleIds" = '{}';
