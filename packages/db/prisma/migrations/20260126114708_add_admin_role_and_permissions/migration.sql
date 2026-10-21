-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('WEB', 'MOBILE', 'BOTH');

-- AlterEnum
-- Note: We cannot use the new ADMIN value in the same transaction due to PostgreSQL limitations
-- The data migration for CLIENT -> ADMIN will be done in a separate migration or via seed
ALTER TYPE "Role" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "canAssignTasks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canCreateTasks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageUsers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewAllTasks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "platform" "Platform" NOT NULL DEFAULT 'BOTH';
