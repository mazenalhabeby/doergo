-- The task-type library: platform-curated templates every tenant copies from.
--
-- No organizationId on purpose — this table belongs to the platform. Tenants
-- read published rows and clone them; nothing points back here afterwards, so a
-- curator's edit can never reach a running task's state machine.
--
-- Idempotent (IF NOT EXISTS): the shadow database is unusable in this project,
-- so migrations are hand-authored and must tolerate being re-applied.

CREATE TABLE IF NOT EXISTS "workflow_templates" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "industry"    TEXT,
  "icon"        TEXT,
  "position"    INTEGER NOT NULL DEFAULT 0,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "isBuiltIn"   BOOLEAN NOT NULL DEFAULT false,
  "definition"  JSONB NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- The slug is how a built-in is recognised, so seeding can never create it
-- twice — including when two service replicas start at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_templates_slug_key"
  ON "workflow_templates" ("slug");

CREATE INDEX IF NOT EXISTS "workflow_templates_isPublished_industry_idx"
  ON "workflow_templates" ("isPublished", "industry");
