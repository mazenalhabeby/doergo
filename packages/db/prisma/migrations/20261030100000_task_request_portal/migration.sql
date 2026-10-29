-- Additive: a client request remembers the PORTAL it was raised in.
-- The inbox read requests through `customer.portalId` — the client's CURRENT portal — so removing a client
-- from a portal (or moving them) took every open request out of the inbox it was raised to.
ALTER TABLE "tasks" ADD COLUMN "portalId" TEXT;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_portalId_fkey"
  FOREIGN KEY ("portalId") REFERENCES "portals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tasks_portalId_triaged_idx" ON "tasks"("portalId", "triaged");

-- Backfill: the best evidence of where an existing request was raised is the client's portal today.
UPDATE "tasks" t
SET "portalId" = c."portalId"
FROM "customers" c
WHERE t."customerId" = c."id"
  AND t."source" = 'CUSTOMER_PORTAL'
  AND t."portalId" IS NULL
  AND c."portalId" IS NOT NULL;
