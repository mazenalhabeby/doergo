-- Approval rules for four more kinds (changed hours, missed clock-ins, asset papers, client requests).
-- Additive and idempotent: existing rules keep exactly their meaning (no asset kind, not urgent-only).
ALTER TABLE "approval_rules" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "approval_rules" ADD COLUMN IF NOT EXISTS "urgentOnly" BOOLEAN NOT NULL DEFAULT false;
