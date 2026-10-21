-- Which workflows a space offers.
--
-- Additive and idempotent (the shadow database is unusable in this project, so
-- migrations are hand-authored). CompanyLocation."workflowId" is untouched and
-- keeps working as the fallback — nothing changes behaviour until resolution
-- starts reading this table, and even then every space keeps what it had
-- because of the backfill at the end.

CREATE TABLE IF NOT EXISTS "space_workflows" (
    "id"         TEXT NOT NULL,
    "spaceId"    TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "isDefault"  BOOLEAN NOT NULL DEFAULT false,
    "position"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_workflows_pkey" PRIMARY KEY ("id")
);

-- A workflow is offered by a space once, not twice.
CREATE UNIQUE INDEX IF NOT EXISTS "space_workflows_spaceId_workflowId_key"
    ON "space_workflows"("spaceId", "workflowId");

CREATE INDEX IF NOT EXISTS "space_workflows_spaceId_idx"    ON "space_workflows"("spaceId");
CREATE INDEX IF NOT EXISTS "space_workflows_workflowId_idx" ON "space_workflows"("workflowId");

-- At most ONE default per space, enforced here rather than in application code.
-- "Which one is the default" being ambiguous is a bug nothing can repair after
-- the fact — two rows both claiming it would make task creation depend on row
-- order. A partial unique index makes that state unrepresentable.
CREATE UNIQUE INDEX IF NOT EXISTS "space_workflows_one_default_per_space"
    ON "space_workflows"("spaceId") WHERE "isDefault";

DO $$
BEGIN
    ALTER TABLE "space_workflows"
        ADD CONSTRAINT "space_workflows_spaceId_fkey"
        FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "space_workflows"
        ADD CONSTRAINT "space_workflows_workflowId_fkey"
        FOREIGN KEY ("workflowId") REFERENCES "status_workflows"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: every space keeps the workflow it already has, now expressed as a
-- row and marked its default. Re-running changes nothing.
INSERT INTO "space_workflows" ("id", "spaceId", "workflowId", "isDefault", "position")
SELECT gen_random_uuid()::text, cl."id", cl."workflowId", true, 0
FROM "company_locations" cl
WHERE cl."workflowId" IS NOT NULL
ON CONFLICT ("spaceId", "workflowId") DO NOTHING;
