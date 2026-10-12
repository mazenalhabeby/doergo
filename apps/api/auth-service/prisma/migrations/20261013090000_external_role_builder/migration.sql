-- External members — a permission builder per workspace (docs/plans/external-role-builder.md).
-- Additive, idempotent. Nobody gains or loses an ability on the day it ships:
-- every new key is granted to exactly the roles whose broader key carried it.

-- A PERSONAL role: one person's permissions in one workspace.
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "personalAssignmentId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "roles_personalAssignmentId_key" ON "roles"("personalAssignmentId");
DO $$ BEGIN
  ALTER TABLE "roles" ADD CONSTRAINT "roles_personalAssignmentId_fkey"
    FOREIGN KEY ("personalAssignmentId") REFERENCES "space_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- What an external invitee may do in the invitation's workspace.
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "spacePermissions" JSONB;

-- Approving and deleting attendance were part of reconciling it.
UPDATE "roles" SET "permissions" = "permissions" || '{"canApproveAttendance": true, "canDeleteAttendance": true}'::jsonb
WHERE ("permissions"->>'canReconcileAttendance') = 'true';

-- Adding people to a workspace and giving them roles were part of managing members.
UPDATE "roles" SET "permissions" = "permissions" || '{"canAddSpaceMembers": true, "canGrantSpaceRoles": true}'::jsonb
WHERE ("permissions"->>'canManageUsers') = 'true';

-- Managing assets included logging against them and reading them.
UPDATE "roles" SET "permissions" = "permissions" || '{"canLogAssets": true, "canViewAssets": true}'::jsonb
WHERE ("permissions"->>'canManageAssets') = 'true';

-- Managing portals included reading and answering their requests.
UPDATE "roles" SET "permissions" = "permissions" || '{"canViewPortal": true, "canAnswerPortal": true}'::jsonb
WHERE ("permissions"->>'canManagePortals') = 'true';

-- Asset READS were gated on canViewAllTasks. Keep that for internal roles only:
-- external members were refused every asset route outright until now, so a role
-- held by one gains nothing here (their admin grants it in the builder).
UPDATE "roles" r SET "permissions" = r."permissions" || '{"canViewAssets": true}'::jsonb
WHERE (r."permissions"->>'canViewAllTasks') = 'true'
  AND r."slug" NOT LIKE 'external-%'
  AND NOT EXISTS (
    SELECT 1 FROM "space_assignments" sa JOIN "users" u ON u."id" = sa."userId"
    WHERE sa."roleId" = r."id" AND u."isExternal" = true
  );
