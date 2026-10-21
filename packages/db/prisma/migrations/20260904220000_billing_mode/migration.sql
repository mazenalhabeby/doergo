-- How an organization pays us: one column, three answers.
--
-- `billedExternally` could only say "charge the card" or "charge nothing", and
-- the useful middle case — a contract customer who still wants a proper invoice
-- — had no way to be expressed.
--
-- Hand-authored and idempotent: the shadow database on this project is broken,
-- so `migrate dev` is never used and every migration must survive being applied
-- to a database that already has part of it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingMode') THEN
    CREATE TYPE "BillingMode" AS ENUM ('AUTOMATIC', 'INVOICE', 'EXTERNAL');
  END IF;
END $$;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "billingMode" "BillingMode" NOT NULL DEFAULT 'AUTOMATIC';

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "invoiceDueDays" INTEGER NOT NULL DEFAULT 14;

-- Nobody's billing moves on deploy.
--
-- Every organization already marked as billed by agreement becomes EXTERNAL,
-- which is exactly what that flag meant; everyone else becomes AUTOMATIC, which
-- is what they already were. INVOICE is only ever reached deliberately, by an
-- operator, for an organization that has a billing email.
UPDATE "organizations"
   SET "billingMode" = 'EXTERNAL'
 WHERE "billedExternally" = true
   AND "billingMode" <> 'EXTERNAL';

-- Finding the contract customers is a listing operation in the operator console
-- and a filter in every billing report, so it gets an index rather than a scan.
CREATE INDEX IF NOT EXISTS "organizations_billingMode_idx"
  ON "organizations" ("billingMode");
