-- An agreed price: a fixed monthly amount that replaces an organization's
-- computed bill. Operator-set only; additive and reversible — clearing the
-- columns puts the organization back on the price list untouched.
--
-- Hand-authored and idempotent: the shadow database on this project is broken,
-- so `migrate dev` is never used and every statement must survive a re-run.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "agreedMonthlyCents" INTEGER;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "agreedListCents"    INTEGER;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "agreedUntil"        TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "agreedNote"         TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "agreedSetAt"        TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "agreedSetById"      TEXT;

-- Two more kinds of billing alert. ADD VALUE IF NOT EXISTS is idempotent, and
-- must run outside a transaction block in older PostgreSQL — Prisma runs each
-- migration file in one, so these are guarded rather than conditional.
ALTER TYPE "BillingAlertKind" ADD VALUE IF NOT EXISTS 'CONTRACT_DRIFT';
ALTER TYPE "BillingAlertKind" ADD VALUE IF NOT EXISTS 'CONTRACT_EXPIRING';

-- Only contracted organizations are ever swept for drift or expiry, and there
-- are a handful of them among all organizations. Partial index so the nightly
-- sweep reads those rows and not the table.
CREATE INDEX IF NOT EXISTS "organizations_agreed_idx"
  ON "organizations" ("agreedMonthlyCents")
  WHERE "agreedMonthlyCents" IS NOT NULL;
