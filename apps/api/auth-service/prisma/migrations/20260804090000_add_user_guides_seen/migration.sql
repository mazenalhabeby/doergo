-- Per-user one-time welcome-tour flag. Additive + idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "guidesSeen" BOOLEAN NOT NULL DEFAULT false;

-- Existing accounts are NOT new signups → mark them as already seen so the
-- welcome tour does not auto-run for them. (New rows keep the default false.)
UPDATE "users" SET "guidesSeen" = true WHERE "guidesSeen" = false;
