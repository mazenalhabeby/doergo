-- A member sends in a document; the office decides whether it becomes a thing.
--
-- A driver is handed a rental agreement at a desk. They cannot create assets —
-- creating a record, reassigning the organization's property and taking a
-- vehicle off the books is `canManageAssets`, and it always will be. What they
-- CAN do is send the page in. The reader decides whether it looks like a
-- contract for a thing, and if it does, this row lands in front of whoever is
-- responsible for them.
--
-- ⚠️ The FIELDS are stored, not a plan. Which custody would close and which
-- record would be retired are recomputed at review time from the kind and from
-- what the member holds THEN. A plan frozen at upload would be stale the moment
-- anything else changed — and would be executed anyway.
--
-- No foreign keys on the people or the kind: this is a record of something that
-- happened, and removing a member must never be blocked by it or erase it. The
-- same reasoning that leaves `asset_money.authorId` unconstrained.
--
-- Additive and idempotent: the shadow database is broken here, so migrations
-- are hand-authored and must be safe to re-run.

CREATE TABLE IF NOT EXISTS "asset_proposals" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "raisedById"     TEXT NOT NULL,
    "holderUserId"   TEXT,
    "categoryId"     TEXT,
    "fields"         JSONB NOT NULL,
    "documentKind"   TEXT NOT NULL DEFAULT 'asset-contract',
    "signals"        JSONB,
    "fileKey"        TEXT,
    "fileName"       TEXT,
    "fileMime"       TEXT,
    "status"         TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById"   TEXT,
    "reviewedAt"     TIMESTAMP(3),
    "reviewNote"     TEXT,
    "createdAssetId" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_proposals_pkey" PRIMARY KEY ("id")
);

-- The reviewer's queue: everything an organization has waiting.
CREATE INDEX IF NOT EXISTS "asset_proposals_organizationId_status_createdAt_idx"
    ON "asset_proposals"("organizationId", "status", "createdAt");
-- "What have I sent in" — the member's own list, on the phone.
CREATE INDEX IF NOT EXISTS "asset_proposals_raisedById_createdAt_idx"
    ON "asset_proposals"("raisedById", "createdAt");
