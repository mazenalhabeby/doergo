-- ============================================================================
-- Space-centric migration: every org gets a default "Main Office" space, and every
-- space-less task is moved into it. Idempotent — safe to run multiple times.
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/space-centric-migration.sql
-- ============================================================================

-- 1. One default "Main Office" space per org (only if none exists yet).
INSERT INTO company_locations
  (id, name, "organizationId", "isDefault", "isActive", "enabledModules", "geofenceRadius", timezone, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'Main Office',
  o.id,
  true,
  true,
  COALESCE(o."enabledModules", '["subtasks","checklists","attachments","tracking","service_reports","time_tracking"]'::jsonb),
  15,
  'Europe/Berlin',
  now(),
  now()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM company_locations cl
  WHERE cl."organizationId" = o.id AND cl."isDefault" = true
);

-- 2. Assign space-less tasks to their org's default space.
UPDATE tasks t
SET "spaceId" = cl.id
FROM company_locations cl
WHERE cl."organizationId" = t."organizationId"
  AND cl."isDefault" = true
  AND t."spaceId" IS NULL;
