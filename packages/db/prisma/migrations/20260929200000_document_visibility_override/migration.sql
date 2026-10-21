-- Per-document visibility: hide from the member, or limit to named roles.
-- Additive with defaults that reproduce today's behaviour exactly
-- (visible to its member, type decides for everyone else).
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "hiddenFromMember" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "rolesOverridden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "visibleToRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX IF NOT EXISTS "documents_userId_hiddenFromMember_idx" ON "documents"("userId", "hiddenFromMember");
ALTER TYPE "DocumentEventType" ADD VALUE IF NOT EXISTS 'VISIBILITY_CHANGED';
