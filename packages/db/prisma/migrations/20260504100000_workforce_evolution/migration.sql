-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('FIXED_SCHEDULE', 'HOUR_BUDGET');

-- CreateEnum
CREATE TYPE "OvertimePolicy" AS ENUM ('PRE_APPROVED', 'REAL_TIME', 'POST_APPROVAL');

-- CreateEnum
CREATE TYPE "OvertimeDetectionSource" AS ENUM ('MANUAL', 'AUTO_BUDGET', 'AUTO_SCHEDULE');

-- Add position and enabledModules to users
ALTER TABLE "users" ADD COLUMN "position" TEXT;
ALTER TABLE "users" ADD COLUMN "enabledModules" JSONB;

-- Add position and enabledModules to invitations (replacing workMode)
ALTER TABLE "invitations" ADD COLUMN "position" TEXT;
ALTER TABLE "invitations" ADD COLUMN "enabledModules" JSONB;

-- Add detection fields to overtime_requests
ALTER TABLE "overtime_requests" ADD COLUMN "detectionSource" "OvertimeDetectionSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "overtime_requests" ADD COLUMN "contractId" TEXT;

-- CreateTable: position_templates
CREATE TABLE "position_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultModules" JSONB NOT NULL,
    "defaultContractType" "ContractType",
    "defaultOvertimePolicy" "OvertimePolicy",
    "organizationId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: work_contracts
CREATE TABLE "work_contracts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "monthlyHours" DOUBLE PRECISION,
    "overtimePolicy" "OvertimePolicy" NOT NULL DEFAULT 'REAL_TIME',
    "overtimeBudget" DOUBLE PRECISION,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: monthly_hours_summaries
CREATE TABLE "monthly_hours_summaries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "budgetHours" DOUBLE PRECISION NOT NULL,
    "workedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_hours_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "position_templates_organizationId_idx" ON "position_templates"("organizationId");
CREATE INDEX "position_templates_isActive_idx" ON "position_templates"("isActive");
CREATE UNIQUE INDEX "position_templates_organizationId_name_key" ON "position_templates"("organizationId", "name");

-- CreateIndex
CREATE INDEX "work_contracts_userId_isActive_idx" ON "work_contracts"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_hours_summaries_userId_year_month_key" ON "monthly_hours_summaries"("userId", "year", "month");
CREATE INDEX "monthly_hours_summaries_contractId_idx" ON "monthly_hours_summaries"("contractId");

-- AddForeignKey
ALTER TABLE "position_templates" ADD CONSTRAINT "position_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_contracts" ADD CONSTRAINT "work_contracts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monthly_hours_summaries" ADD CONSTRAINT "monthly_hours_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: populate position from role
UPDATE "users" SET "position" = 'technician' WHERE "role" = 'TECHNICIAN';

-- Data migration: populate enabledModules based on existing workMode
UPDATE "users" SET "enabledModules" = '["tasks", "time_off"]'::jsonb
  WHERE "role" = 'TECHNICIAN' AND "workMode" = 'ON_ROAD';
UPDATE "users" SET "enabledModules" = '["clock", "time_off"]'::jsonb
  WHERE "role" = 'TECHNICIAN' AND "workMode" = 'ON_SITE';
UPDATE "users" SET "enabledModules" = '["tasks", "clock", "time_off"]'::jsonb
  WHERE "role" = 'TECHNICIAN' AND "workMode" = 'HYBRID';
UPDATE "users" SET "enabledModules" = '["tasks", "clock", "time_off", "create_task", "manage"]'::jsonb
  WHERE "role" IN ('ADMIN', 'CLIENT');

-- Data migration: create work contracts from technicianType
INSERT INTO "work_contracts" ("id", "userId", "contractType", "overtimePolicy", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, id, 'FIXED_SCHEDULE', 'REAL_TIME', true, NOW(), NOW()
FROM "users" WHERE "role" = 'TECHNICIAN' AND "technicianType" = 'FULL_TIME';

INSERT INTO "work_contracts" ("id", "userId", "contractType", "monthlyHours", "overtimePolicy", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, id, 'HOUR_BUDGET', 160, 'REAL_TIME', true, NOW(), NOW()
FROM "users" WHERE "role" = 'TECHNICIAN' AND "technicianType" = 'FREELANCER';

-- Seed system position templates
INSERT INTO "position_templates" ("id", "name", "description", "defaultModules", "defaultContractType", "defaultOvertimePolicy", "isSystem", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Technician', 'Field service technician', '["tasks", "clock", "time_off"]'::jsonb, 'FIXED_SCHEDULE', 'REAL_TIME', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Driver', 'Delivery or logistics driver', '["tasks", "clock"]'::jsonb, 'FIXED_SCHEDULE', 'REAL_TIME', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Office Manager', 'On-site office management', '["clock", "time_off"]'::jsonb, 'FIXED_SCHEDULE', 'POST_APPROVAL', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Sales Representative', 'Field sales agent', '["tasks", "time_off"]'::jsonb, 'HOUR_BUDGET', 'POST_APPROVAL', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Accountant', 'Office finance staff', '["clock", "time_off"]'::jsonb, 'FIXED_SCHEDULE', 'POST_APPROVAL', true, true, NOW(), NOW());

-- Drop workMode column from users
ALTER TABLE "users" DROP COLUMN "workMode";

-- Drop workMode column from invitations
ALTER TABLE "invitations" DROP COLUMN "workMode";

-- Drop the WorkMode enum type
DROP TYPE "WorkMode";
