-- Pre-assigned space on invitations (applied to the accepting user).
-- Idempotent (ADD COLUMN IF NOT EXISTS) to survive prod db-push drift.
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "spaceId" TEXT;
