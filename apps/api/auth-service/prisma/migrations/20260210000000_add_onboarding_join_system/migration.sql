-- CreateEnum
CREATE TYPE "JoinPolicy" AS ENUM ('OPEN', 'INVITE_ONLY', 'CLOSED');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- AlterTable: Add join code and policy to organizations
ALTER TABLE "organizations" ADD COLUMN "joinCodeHash" TEXT,
ADD COLUMN "joinPolicy" "JoinPolicy" NOT NULL DEFAULT 'INVITE_ONLY';

-- CreateIndex
CREATE UNIQUE INDEX "organizations_joinCodeHash_key" ON "organizations"("joinCodeHash");

-- AlterTable: Add onboardingCompleted to users (default true so existing users are unaffected)
ALTER TABLE "users" ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT true;

-- Ensure all existing users have onboardingCompleted = true
UPDATE "users" SET "onboardingCompleted" = true;

-- CreateTable: JoinRequest
CREATE TABLE "join_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "message" TEXT,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "assignedRole" "Role",
    "assignedPlatform" "Platform",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "join_requests_userId_organizationId_status_key" ON "join_requests"("userId", "organizationId", "status");

-- CreateIndex
CREATE INDEX "join_requests_organizationId_status_idx" ON "join_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "join_requests_userId_idx" ON "join_requests"("userId");

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
