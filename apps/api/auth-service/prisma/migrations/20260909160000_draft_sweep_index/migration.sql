-- The nightly sweep of abandoned staged drafts asks one question:
-- "which DRAFT rows are older than the cutoff", across every organization.
--
-- The existing index is [organizationId, status], which cannot serve that —
-- it is ordered by a column the sweep does not filter on. A PARTIAL index is
-- the right shape here and costs almost nothing: staged drafts are a handful of
-- rows at any moment (a batch lives for minutes), so this indexes a few rows
-- rather than the whole documents table, and it shrinks back to empty as soon
-- as a batch is published.
--
-- Additive and idempotent; the shadow database is broken here, so migrations
-- are hand-authored and must be safe to re-run.
CREATE INDEX IF NOT EXISTS "documents_draft_created_idx"
  ON "documents" ("createdAt")
  WHERE "status" = 'DRAFT';
