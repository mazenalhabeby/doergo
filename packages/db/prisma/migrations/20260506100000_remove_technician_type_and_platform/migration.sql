ALTER TABLE "users" DROP COLUMN IF EXISTS "technicianType";
ALTER TABLE "users" DROP COLUMN IF EXISTS "platform";
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "technicianType";
DROP TYPE IF EXISTS "TechnicianType";
