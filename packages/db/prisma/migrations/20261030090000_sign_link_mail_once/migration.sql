-- A client is emailed ONCE when it becomes their turn on a step, then reminded
-- after 3 and 7 days. Additive.
ALTER TABLE "document_signers" ADD COLUMN "linkMailedAt" TIMESTAMP(3);
ALTER TABLE "document_signers" ADD COLUMN "linkReminders" INTEGER NOT NULL DEFAULT 0;

-- Steps already waiting were emailed by the old sweep (every few minutes), so
-- they count as mailed today: no burst of first emails on deploy day.
UPDATE "document_signers"
SET "linkMailedAt" = NOW()
WHERE "status" = 'PENDING' AND "notifiedAt" IS NOT NULL AND "email" IS NOT NULL;
