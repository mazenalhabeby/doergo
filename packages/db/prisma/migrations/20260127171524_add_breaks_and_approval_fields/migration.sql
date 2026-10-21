-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO');

-- CreateEnum
CREATE TYPE "BreakType" AS ENUM ('LUNCH', 'SHORT', 'OTHER');

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "approvalNotes" TEXT,
ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "breakMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "editReason" TEXT,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT,
ADD COLUMN     "isEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalClockIn" TIMESTAMP(3),
ADD COLUMN     "originalClockOut" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "breaks" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "type" "BreakType" NOT NULL DEFAULT 'SHORT',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breaks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "breaks_timeEntryId_idx" ON "breaks"("timeEntryId");

-- CreateIndex
CREATE INDEX "breaks_startedAt_idx" ON "breaks"("startedAt");

-- CreateIndex
CREATE INDEX "time_entries_approvalStatus_idx" ON "time_entries"("approvalStatus");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
