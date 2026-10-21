-- Capture WHY a no-show was excused (approved absence, sick leave, etc.) + who did it.
-- Additive + idempotent.
ALTER TABLE "shift_instances" ADD COLUMN IF NOT EXISTS "excuseReason" TEXT;
ALTER TABLE "shift_instances" ADD COLUMN IF NOT EXISTS "excusedById" TEXT;
