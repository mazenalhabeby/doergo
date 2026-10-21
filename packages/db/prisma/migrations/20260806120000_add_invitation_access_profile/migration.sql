-- Pre-configured Access Profile on an invitation. Applied to the member on
-- accept so their first screen already matches their final access.
-- Additive + idempotent (safe to re-run on prod).
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "accessProfile" JSONB;
