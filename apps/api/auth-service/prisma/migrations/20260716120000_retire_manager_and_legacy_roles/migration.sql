-- Retire the MANAGER role and the legacy aliases (CLIENT/DISPATCHER/TECHNICIAN).
-- "Manager" capability is now expressed by the canViewAllTasks/canAssignTasks
-- access flags, not a role. This collapses the Role enum to { ADMIN, EMPLOYEE }.
-- Idempotent: the UPDATEs are no-ops once applied, and the enum is only recreated
-- while MANAGER still exists (survives prod schema drift / re-runs).

-- 1) Preserve manager/dispatcher capability via flags BEFORE collapsing their role.
UPDATE "users"
  SET "canViewAllTasks" = true, "canAssignTasks" = true
  WHERE "role" IN ('MANAGER', 'DISPATCHER');

-- 2) Collapse retired role values on every Role-typed column.
UPDATE "users"          SET "role"         = 'ADMIN'    WHERE "role"         = 'CLIENT';
UPDATE "users"          SET "role"         = 'EMPLOYEE' WHERE "role"         IN ('MANAGER', 'DISPATCHER', 'TECHNICIAN');
UPDATE "invitations"    SET "targetRole"   = 'ADMIN'    WHERE "targetRole"   = 'CLIENT';
UPDATE "invitations"    SET "targetRole"   = 'EMPLOYEE' WHERE "targetRole"   IN ('MANAGER', 'DISPATCHER', 'TECHNICIAN');
UPDATE "join_requests"  SET "assignedRole" = 'ADMIN'    WHERE "assignedRole" = 'CLIENT';
UPDATE "join_requests"  SET "assignedRole" = 'EMPLOYEE' WHERE "assignedRole" IN ('MANAGER', 'DISPATCHER', 'TECHNICIAN');

-- 3) Recreate the Role enum with only the surviving values (guarded → idempotent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Role' AND e.enumlabel = 'MANAGER'
  ) THEN
    ALTER TYPE "Role" RENAME TO "Role_old";
    CREATE TYPE "Role" AS ENUM ('ADMIN', 'EMPLOYEE');
    ALTER TABLE "users"         ALTER COLUMN "role"         TYPE "Role" USING ("role"::text::"Role");
    ALTER TABLE "invitations"   ALTER COLUMN "targetRole"   TYPE "Role" USING ("targetRole"::text::"Role");
    ALTER TABLE "join_requests" ALTER COLUMN "assignedRole" TYPE "Role" USING ("assignedRole"::text::"Role");
    DROP TYPE "Role_old";
  END IF;
END $$;
