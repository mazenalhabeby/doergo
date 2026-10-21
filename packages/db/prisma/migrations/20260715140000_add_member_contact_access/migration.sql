-- Per-member contact directory + access control (secure by default).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "contactable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "contactScope" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "contactAllowedIds" TEXT[] NOT NULL DEFAULT '{}';
