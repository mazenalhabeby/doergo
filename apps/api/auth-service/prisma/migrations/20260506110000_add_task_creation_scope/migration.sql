-- CreateEnum
CREATE TYPE "TaskCreationScope" AS ENUM ('NONE', 'SELF', 'TEAM', 'ORG');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "taskCreationScope" "TaskCreationScope" NOT NULL DEFAULT 'NONE';

-- Backfill: set taskCreationScope based on existing canCreateTasks and role
UPDATE "users" SET "taskCreationScope" = 'ORG' WHERE "role" = 'ADMIN' AND "canCreateTasks" = true;
UPDATE "users" SET "taskCreationScope" = 'TEAM' WHERE "role" = 'DISPATCHER';
UPDATE "users" SET "taskCreationScope" = 'SELF' WHERE "role" = 'TECHNICIAN';
