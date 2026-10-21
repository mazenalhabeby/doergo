-- Each workspace switches on the company work roles it uses. Backfill: a role is
-- on wherever it already has a day rate of its own or somebody holding it, so no
-- workspace loses a role it uses. Re-running is a no-op.
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "workRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "company_locations" l SET "workRoleIds" = x.ids
FROM (
  SELECT u."spaceId", array_agg(DISTINCT u."roleId") AS ids
  FROM (
    SELECT h."spaceId", h."targetId" AS "roleId"
      FROM "rate_history" h JOIN "roles" r ON r."id" = h."targetId" AND r."kind" = 'WORK'
     WHERE h."target" = 'ROLE' AND h."spaceId" IS NOT NULL
    UNION
    SELECT a."spaceId", a."workRoleId" FROM "space_assignments" a WHERE a."workRoleId" IS NOT NULL
  ) u
  GROUP BY u."spaceId"
) x
WHERE l."id" = x."spaceId" AND l."workRoleIds" = ARRAY[]::TEXT[];
