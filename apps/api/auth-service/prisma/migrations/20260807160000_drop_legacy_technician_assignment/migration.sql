-- Phase 5b: retire the legacy TechnicianAssignment model.
-- Its rows are merged into the unified space_assignments table, then the
-- legacy table is dropped. SpaceAssignment is a strict superset (adds
-- organizationId + roleId + routing), so every legacy row maps 1:1.

-- 1) Backfill: copy each active/expired assignment into space_assignments.
--    ON CONFLICT (userId, spaceId) DO NOTHING preserves any richer unified
--    row already present (e.g. one that carries a roleId / routing override).
INSERT INTO "space_assignments" (
  "id", "organizationId", "userId", "spaceId", "roleId",
  "isPrimary", "schedule", "effectiveFrom", "effectiveTo",
  "createdAt", "updatedAt"
)
SELECT
  'ta_' || ta."id",
  cl."organizationId",
  ta."userId",
  ta."locationId",
  NULL,
  ta."isPrimary",
  ta."schedule",
  ta."effectiveFrom",
  ta."effectiveTo",
  ta."createdAt",
  ta."updatedAt"
FROM "technician_assignments" ta
JOIN "company_locations" cl ON cl."id" = ta."locationId"
ON CONFLICT ("userId", "spaceId") DO NOTHING;

-- 2) Drop the legacy table.
DROP TABLE IF EXISTS "technician_assignments";
