-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ON_SITE', 'ON_ROAD', 'HYBRID');

-- AlterTable: Add workMode to users with default HYBRID
ALTER TABLE "users" ADD COLUMN "workMode" "WorkMode" NOT NULL DEFAULT 'HYBRID';

-- AlterTable: Add workMode to invitations (nullable)
ALTER TABLE "invitations" ADD COLUMN "workMode" "WorkMode";

-- Data migration: Set workMode based on existing technicianType for TECHNICIAN users
-- FULL_TIME technicians were previously on-site only → ON_SITE
UPDATE "users" SET "workMode" = 'ON_SITE' WHERE "role" = 'TECHNICIAN' AND "technicianType" = 'FULL_TIME';
-- FREELANCER technicians were previously on-road only → ON_ROAD
UPDATE "users" SET "workMode" = 'ON_ROAD' WHERE "role" = 'TECHNICIAN' AND "technicianType" = 'FREELANCER';
