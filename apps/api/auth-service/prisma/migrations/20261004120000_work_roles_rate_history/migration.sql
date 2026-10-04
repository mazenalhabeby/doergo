-- Work roles (a trade that carries billing, grants nothing), a second role per
-- workspace member, and dated rates so a rate change never rewrites the past.
-- Additive and idempotent. Every existing role becomes MANAGEMENT (what it
-- already is), and every existing rate is backfilled as "in force since always",
-- so no figure anybody can see today moves.

DO $$ BEGIN CREATE TYPE "RoleKind" AS ENUM ('WORK', 'MANAGEMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BillBy" AS ENUM ('HOUR', 'DAY', 'BOTH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RateTarget" AS ENUM ('ORGANIZATION', 'SPACE', 'MEMBER', 'ASSIGNMENT', 'ROLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RateKind" AS ENUM ('BILL_HOUR', 'COST_HOUR', 'BILL_DAY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "InvoiceLineKind" AS ENUM ('HOURS', 'DAYS', 'HEADING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "kind" "RoleKind" NOT NULL DEFAULT 'MANAGEMENT';

ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "workRoleId" TEXT;
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "allowSecondRole" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "billBy" "BillBy";
DO $$ BEGIN
  ALTER TABLE "space_assignments" ADD CONSTRAINT "space_assignments_workRoleId_fkey"
    FOREIGN KEY ("workRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "space_assignments_workRoleId_idx" ON "space_assignments"("workRoleId");

ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "billedDays" DOUBLE PRECISION;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "lineKind" "InvoiceLineKind";
-- A DAYS line names whose days and which run, so the same days are never billed twice.
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "workerId" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "dayFrom" DATE;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "dayTo" DATE;
CREATE INDEX IF NOT EXISTS "invoice_items_workerId_dayFrom_idx" ON "invoice_items"("workerId", "dayFrom");

CREATE TABLE IF NOT EXISTS "rate_history" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "target" "RateTarget" NOT NULL,
  "targetId" TEXT NOT NULL,
  "spaceId" TEXT,
  "kind" "RateKind" NOT NULL,
  "cents" INTEGER,
  "effectiveFrom" DATE NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rate_history_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  ALTER TABLE "rate_history" ADD CONSTRAINT "rate_history_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "rate_history_organizationId_target_targetId_kind_effectiveF_idx"
  ON "rate_history"("organizationId", "target", "targetId", "kind", "effectiveFrom");

-- Backfill: every rate set today has applied "since always". Re-running is a no-op.
INSERT INTO "rate_history" ("id", "organizationId", "target", "targetId", "kind", "cents", "effectiveFrom")
SELECT 'rh_' || md5(x.t || x.k || x.tid), x.org, x.t::"RateTarget", x.tid, x.k::"RateKind", x.c, DATE '1970-01-01'
FROM (
  SELECT 'ORGANIZATION' t, 'BILL_HOUR' k, o."id" tid, o."id" org, o."billableRateCents" c FROM "organizations" o WHERE o."billableRateCents" IS NOT NULL
  UNION ALL SELECT 'ORGANIZATION', 'COST_HOUR', o."id", o."id", o."costRateCents" FROM "organizations" o WHERE o."costRateCents" IS NOT NULL
  UNION ALL SELECT 'SPACE', 'BILL_HOUR', l."id", l."organizationId", l."billableRateCents" FROM "company_locations" l WHERE l."billableRateCents" IS NOT NULL
  UNION ALL SELECT 'SPACE', 'COST_HOUR', l."id", l."organizationId", l."costRateCents" FROM "company_locations" l WHERE l."costRateCents" IS NOT NULL
  UNION ALL SELECT 'MEMBER', 'BILL_HOUR', u."id", u."organizationId", u."billRateCents" FROM "users" u WHERE u."billRateCents" IS NOT NULL AND u."organizationId" IS NOT NULL
  UNION ALL SELECT 'MEMBER', 'COST_HOUR', u."id", u."organizationId", u."costRateCents" FROM "users" u WHERE u."costRateCents" IS NOT NULL AND u."organizationId" IS NOT NULL
  UNION ALL SELECT 'ASSIGNMENT', 'BILL_HOUR', a."id", a."organizationId", a."billRateCents" FROM "space_assignments" a WHERE a."billRateCents" IS NOT NULL
  UNION ALL SELECT 'ASSIGNMENT', 'COST_HOUR', a."id", a."organizationId", a."costRateCents" FROM "space_assignments" a WHERE a."costRateCents" IS NOT NULL
) x
ON CONFLICT ("id") DO NOTHING;
