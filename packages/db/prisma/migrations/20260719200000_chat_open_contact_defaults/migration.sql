-- Chat is open within the org by default. Flip the contact column defaults from
-- locked-down (NONE / false) to open (ALL / true), and backfill existing users
-- so anyone can already message anyone. Admins restrict via the Access Builder
-- (canContact:false, or contactScope SELECTED). Idempotent + safe for prod drift.

-- New-row defaults
ALTER TABLE "users" ALTER COLUMN "contactScope" SET DEFAULT 'ALL';
ALTER TABLE "users" ALTER COLUMN "contactable" SET DEFAULT true;

-- Backfill existing rows that still carry the old restrictive defaults.
-- 'NONE' was only ever the default (never set deliberately), so promoting it to
-- 'ALL' does not override any real admin restriction.
UPDATE "users" SET "contactScope" = 'ALL' WHERE "contactScope" = 'NONE';
UPDATE "users" SET "contactable" = true WHERE "contactable" = false;
