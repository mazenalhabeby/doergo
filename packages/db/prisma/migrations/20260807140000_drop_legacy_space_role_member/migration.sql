-- Phase 5: retire SpaceRole + SpaceMember. Fully replaced by AccessRole
-- (scope SPACE) + SpaceAssignment; space_members is empty and space_roles was
-- backfilled into roles. Guarded drops for prod-drift safety.
DROP TABLE IF EXISTS "space_members" CASCADE;
DROP TABLE IF EXISTS "space_roles" CASCADE;
