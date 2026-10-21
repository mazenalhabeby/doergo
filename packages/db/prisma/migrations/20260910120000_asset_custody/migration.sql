-- Custody: who held a thing, and WHEN.
--
-- `asset_holders` answers "who has it now" and nothing else — the row is
-- deleted on a handover, so the moment a driver gives a van back there is no
-- record that they ever had it. Every question the business actually asks is
-- about a period: what did this van cost while Ahmed had it, which vans has
-- Ahmed had this year, whose fuel receipt is this.
--
-- So custody is stored as periods, and "who has it now" is simply the period
-- with no end. `asset_holders` is KEPT: it is a small, uniquely-constrained
-- index of the present that every existing screen already reads, and one
-- service writes both in one transaction, so the two cannot drift.
--
-- Neither party is a foreign key. This is history — removing a member or a
-- client must never be blocked by it and must never erase it, the same
-- reasoning that leaves `asset_money.authorId` unconstrained.
--
-- Additive and idempotent throughout: the shadow database is broken here, so
-- migrations are hand-authored and must be safe to re-run.

CREATE TABLE IF NOT EXISTS "asset_custody" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId"        TEXT NOT NULL,
    "userId"         TEXT,
    "customerId"     TEXT,
    "startedAt"      TIMESTAMP(3) NOT NULL,
    "endedAt"        TIMESTAMP(3),
    "reason"         TEXT,
    "openedById"     TEXT,
    "closedById"     TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_custody_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    ALTER TABLE "asset_custody"
        ADD CONSTRAINT "asset_custody_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "asset_custody_assetId_startedAt_idx"  ON "asset_custody"("assetId", "startedAt");
-- "What does this person hold right now" is the query the phone opens on, so
-- endedAt is in the index rather than filtered after the rows are read.
CREATE INDEX IF NOT EXISTS "asset_custody_userId_endedAt_idx"     ON "asset_custody"("userId", "endedAt");
CREATE INDEX IF NOT EXISTS "asset_custody_userId_startedAt_idx"   ON "asset_custody"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "asset_custody_customerId_startedAt_idx" ON "asset_custody"("customerId", "startedAt");

-- ── Backfill ────────────────────────────────────────────────────────────────
--
-- Everyone holding something today gets an OPEN period starting when they were
-- given it. Without this, every asset currently in somebody's hands would read
-- "held by nobody" on the day this ships, and the ledger it already has would
-- attribute to nobody with it.
--
-- `createdAt` on the holder row is the best start available and is honest: it
-- is when this organization recorded that they had it. What came before was
-- never written down by anything, and inventing a date would be worse than
-- starting the record here.
--
-- NOT EXISTS makes a re-run a no-op rather than a second period per holder,
-- which would double every future total.
INSERT INTO "asset_custody" ("id", "organizationId", "assetId", "userId", "customerId", "startedAt", "endedAt", "createdAt")
SELECT
    'cst_' || h."id",
    a."organizationId",
    h."assetId",
    h."userId",
    h."customerId",
    h."createdAt",
    NULL,
    h."createdAt"
FROM "asset_holders" h
JOIN "assets" a ON a."id" = h."assetId"
WHERE NOT EXISTS (
    SELECT 1 FROM "asset_custody" c
    WHERE c."assetId" = h."assetId"
      AND c."endedAt" IS NULL
      AND ((c."userId" IS NOT NULL AND c."userId" = h."userId")
        OR (c."customerId" IS NOT NULL AND c."customerId" = h."customerId"))
);

-- ── A cost can now carry the slip it came from, and a state ─────────────────
--
-- A member photographs a receipt at the pump and sends it. It arrives as
-- SUBMITTED and does not count until somebody with `canManageAssets` accepts
-- it — the office decides what the books say, which is the same rule as every
-- other financial record in this product.
--
-- ⚠️ The default is RECORDED, not SUBMITTED. Every entry that predates this was
-- typed in by the office and already counts; a default of SUBMITTED would empty
-- every asset's totals on the day it deployed.
ALTER TABLE "asset_money" ADD COLUMN IF NOT EXISTS "receiptKey"   TEXT;
ALTER TABLE "asset_money" ADD COLUMN IF NOT EXISTS "receiptName"  TEXT;
ALTER TABLE "asset_money" ADD COLUMN IF NOT EXISTS "receiptMime"  TEXT;
ALTER TABLE "asset_money" ADD COLUMN IF NOT EXISTS "status"       TEXT NOT NULL DEFAULT 'RECORDED';
ALTER TABLE "asset_money" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "asset_money" ADD COLUMN IF NOT EXISTS "reviewedAt"   TIMESTAMP(3);
ALTER TABLE "asset_money" ADD COLUMN IF NOT EXISTS "reviewNote"   TEXT;

CREATE INDEX IF NOT EXISTS "asset_money_organizationId_status_occurredAt_idx" ON "asset_money"("organizationId", "status", "occurredAt");
CREATE INDEX IF NOT EXISTS "asset_money_authorId_occurredAt_idx"              ON "asset_money"("authorId", "occurredAt");
