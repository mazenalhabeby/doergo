-- Pre-assign a unified role (AccessRole) at invite time — applied to the new
-- member's memberRoleId on accept. Additive + idempotent.
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "memberRoleId" TEXT;

DO $$ BEGIN
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_memberRoleId_fkey"
    FOREIGN KEY ("memberRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
