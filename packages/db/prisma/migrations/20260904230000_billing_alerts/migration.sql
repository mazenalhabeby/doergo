-- Revenue leaving is silent.
--
-- A customer dropping from four workspaces to one is a €300/month loss that the
-- system processes correctly, prorates fairly and never mentions. This records
-- the fall so somebody can look at it while the reason is still warm.
--
-- Hand-authored and idempotent: the shadow database is broken on this project,
-- so `migrate dev` is never used.

CREATE TABLE IF NOT EXISTS "billing_alerts" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "fromCents"      INTEGER NOT NULL,
  "toCents"        INTEGER NOT NULL,
  "dropCents"      INTEGER NOT NULL,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedBy" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_alerts_pkey" PRIMARY KEY ("id")
);

-- The console opens on "unacknowledged, newest first".
CREATE INDEX IF NOT EXISTS "billing_alerts_acknowledgedAt_createdAt_idx"
  ON "billing_alerts" ("acknowledgedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "billing_alerts_organizationId_createdAt_idx"
  ON "billing_alerts" ("organizationId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_alerts_organizationId_fkey'
  ) THEN
    ALTER TABLE "billing_alerts"
      ADD CONSTRAINT "billing_alerts_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
