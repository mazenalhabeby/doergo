-- Multi-portal: Portal becomes a first-class entity; categories/residents/units
-- belong to a portal. Idempotent + migrates existing single-portal orgs.

CREATE TABLE IF NOT EXISTS "portals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "contactLabel" TEXT,
    "accent" TEXT,
    "features" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "portals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "portals_organizationId_isActive_idx" ON "portals"("organizationId","isActive");

ALTER TABLE "intake_categories" ADD COLUMN IF NOT EXISTS "portalId" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "portalId" TEXT;
ALTER TABLE "customer_units" ADD COLUMN IF NOT EXISTS "portalId" TEXT;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "portalId" TEXT;

-- Migrate each portal-enabled org into one Portal + attach its data.
DO $$
DECLARE o RECORD; pid TEXT; cfg JSONB;
BEGIN
  FOR o IN SELECT id, name, "customerPortalConfig" FROM "organizations" WHERE "customerPortalEnabled" = true LOOP
    IF EXISTS (SELECT 1 FROM "portals" WHERE "organizationId" = o.id) THEN CONTINUE; END IF;
    cfg := COALESCE(o."customerPortalConfig", '{}'::jsonb);
    pid := 'portal_' || md5(random()::text || o.id || clock_timestamp()::text);
    INSERT INTO "portals" ("id","organizationId","name","templateKey","entityLabel","contactLabel","accent","features","isActive","createdAt","updatedAt")
    VALUES (pid, o.id, COALESCE(NULLIF(o.name,''),'Customer Portal'),
      CASE WHEN cfg->>'entityLabel' = 'Order' THEN 'logistics' WHEN cfg->>'entityLabel' = 'Workspace' THEN 'workplace' ELSE 'rental' END,
      COALESCE(cfg->>'entityLabel','Unit'), cfg->>'contactLabel', cfg->>'accent', cfg->'features', true, now(), now());
    UPDATE "intake_categories" SET "portalId" = pid WHERE "organizationId" = o.id AND "portalId" IS NULL;
    UPDATE "customers" SET "portalId" = pid WHERE "organizationId" = o.id AND "isPortalResident" = true AND "portalId" IS NULL;
    UPDATE "customer_units" SET "portalId" = pid WHERE "organizationId" = o.id AND "portalId" IS NULL;
  END LOOP;
END $$;

DROP INDEX IF EXISTS "intake_categories_organizationId_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "intake_categories_portalId_key_key" ON "intake_categories"("portalId","key");
CREATE INDEX IF NOT EXISTS "intake_categories_portalId_isActive_idx" ON "intake_categories"("portalId","isActive");
CREATE INDEX IF NOT EXISTS "customers_portalId_idx" ON "customers"("portalId");
CREATE INDEX IF NOT EXISTS "customer_units_portalId_idx" ON "customer_units"("portalId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='portals_organizationId_fkey') THEN
    ALTER TABLE "portals" ADD CONSTRAINT "portals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='intake_categories_portalId_fkey') THEN
    ALTER TABLE "intake_categories" ADD CONSTRAINT "intake_categories_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "portals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_portalId_fkey') THEN
    ALTER TABLE "customers" ADD CONSTRAINT "customers_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "portals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customer_units_portalId_fkey') THEN
    ALTER TABLE "customer_units" ADD CONSTRAINT "customer_units_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "portals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
