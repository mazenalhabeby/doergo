-- Phase 4d: per-member, per-space routing overrides on the space assignment,
-- and Space Manager gains canManageUsers WITHIN its space (delegation). Additive.
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "notifyRoleIds"  TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "notifyUserIds"  TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "contactRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "contactUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Grant canManageUsers to existing built-in Space Manager roles so a space
-- manager can manage members + routing within their space.
UPDATE "roles"
   SET "permissions" = jsonb_set("permissions"::jsonb, '{canManageUsers}', 'true'::jsonb, true)
 WHERE "slug" = 'space-manager' AND "isSystem" = true;
