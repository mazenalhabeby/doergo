-- Billing alerts gain a kind, so a failing Stripe sync lands beside a falling
-- bill rather than in a log nobody reads.
--
-- The amount columns become nullable: a sync failure is not about an amount,
-- and storing zeros would make "€0.00" a legitimate-looking drop. Safe to widen
-- — the table was introduced hours ago and holds no rows.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingAlertKind') THEN
    CREATE TYPE "BillingAlertKind" AS ENUM ('DROP', 'SYNC_FAILED');
  END IF;
END $$;

ALTER TABLE "billing_alerts"
  ADD COLUMN IF NOT EXISTS "kind" "BillingAlertKind" NOT NULL DEFAULT 'DROP',
  ADD COLUMN IF NOT EXISTS "detail" TEXT,
  ADD COLUMN IF NOT EXISTS "occurrences" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "billing_alerts" ALTER COLUMN "fromCents" DROP NOT NULL;
ALTER TABLE "billing_alerts" ALTER COLUMN "toCents"   DROP NOT NULL;
ALTER TABLE "billing_alerts" ALTER COLUMN "dropCents" DROP NOT NULL;

-- One open row per org per kind is what the dedupe looks up on every failure.
CREATE INDEX IF NOT EXISTS "billing_alerts_org_kind_ack_idx"
  ON "billing_alerts" ("organizationId", "kind", "acknowledgedAt");
