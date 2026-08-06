-- Phase 3: space-driven contact + notification routing.
-- Adds per-space role config (which roles are notified about / contactable by
-- members here) and flips the member contact default to "no one" (space-driven).
-- Additive + idempotent for prod-drift safety.

-- Per-space routing role lists (AccessRole ids). Empty = default leader roles.
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "notifyRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "contactRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- New members default to contacting no one (their contacts come from the spaces
-- they're assigned to). Existing rows keep their current value.
ALTER TABLE "users" ALTER COLUMN "contactScope" SET DEFAULT 'NONE';
