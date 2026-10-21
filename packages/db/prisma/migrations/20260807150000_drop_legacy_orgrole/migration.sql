-- Phase 5b: retire the legacy OrgRole model.
-- Replaced by the unified AccessRole (scope ORG) + User.memberRoleId.

-- Drop FK columns that referenced org_roles.
ALTER TABLE "users" DROP COLUMN IF EXISTS "orgRoleId";
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "targetOrgRoleId";

-- Drop the table itself.
DROP TABLE IF EXISTS "org_roles";
