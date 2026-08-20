-- How far a task type reaches, and where a submitted template came from.
--
-- ownerSpaceId NULL  → the organization's: any of its spaces may offer it.
-- ownerSpaceId set   → that space's own (created there, or forked from the
--                      library). No other space may offer it.
--
-- Local is the new default for anything created from a space, because widening
-- later is easy and narrowing after five spaces adopted a type is not.
--
-- Idempotent: the shadow database is unusable in this project, so migrations are
-- hand-authored and must tolerate being re-applied.

ALTER TABLE "status_workflows" ADD COLUMN IF NOT EXISTS "ownerSpaceId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'status_workflows_ownerSpaceId_fkey'
  ) THEN
    ALTER TABLE "status_workflows"
      ADD CONSTRAINT "status_workflows_ownerSpaceId_fkey"
      FOREIGN KEY ("ownerSpaceId") REFERENCES "company_locations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "status_workflows_ownerSpaceId_idx"
  ON "status_workflows" ("ownerSpaceId");

-- The org-wide unique name has to go: five spaces each forking "Field Service"
-- all want to call it that, and they are five different rows. Uniqueness is now
-- scoped — per space for a local type, per organization for a shared one — and
-- enforced in the service, because one partial index cannot express "unique
-- within this column's value OR within the org when it is null" without a second
-- index that disagrees with it at the boundary.
ALTER TABLE "status_workflows" DROP CONSTRAINT IF EXISTS "status_workflows_organizationId_name_key";
DROP INDEX IF EXISTS "status_workflows_organizationId_name_key";

-- Provenance for a template an organization submitted. Curator-only: the
-- tenant-facing read selects named fields and never includes these, so a
-- published template carries no trace of who wrote it.
ALTER TABLE "workflow_templates" ADD COLUMN IF NOT EXISTS "submittedByOrgId" TEXT;
ALTER TABLE "workflow_templates" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);

-- "<orgId>:<workflowId>" — re-submitting the same task type updates the row a
-- curator may already be reading, instead of queueing a second copy of it.
ALTER TABLE "workflow_templates" ADD COLUMN IF NOT EXISTS "sourceKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_templates_sourceKey_key"
  ON "workflow_templates" ("sourceKey");
