-- CreateEnum
CREATE TYPE "OvertimeRequestStatus" AS ENUM ('PENDING_TECHNICIAN', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED_NO_RESPONSE', 'EXPIRED_NO_APPROVAL', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "OvertimeApprovalMethod" AS ENUM ('REMOTE', 'SIGNATURE');

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'PENDING_TECHNICIAN',
    "technicianRespondedAt" TIMESTAMP(3),
    "technicianReason" TEXT,
    "approvalMethod" "OvertimeApprovalMethod",
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "approverNotes" TEXT,
    "leaderName" TEXT,
    "leaderSignature" TEXT,
    "maxDurationMinutes" INTEGER,
    "overtimeStartAt" TIMESTAMP(3),
    "overtimeEndAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "overtimeMinutes" INTEGER,
    "technicianTimeoutAt" TIMESTAMP(3),
    "approvalTimeoutAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_timeEntryId_key" ON "overtime_requests"("timeEntryId");

-- CreateIndex
CREATE INDEX "overtime_requests_technicianId_status_idx" ON "overtime_requests"("technicianId", "status");

-- CreateIndex
CREATE INDEX "overtime_requests_organizationId_status_idx" ON "overtime_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "overtime_requests_timeEntryId_idx" ON "overtime_requests"("timeEntryId");

-- CreateIndex
CREATE INDEX "overtime_requests_status_technicianTimeoutAt_idx" ON "overtime_requests"("status", "technicianTimeoutAt");

-- CreateIndex
CREATE INDEX "overtime_requests_status_approvalTimeoutAt_idx" ON "overtime_requests"("status", "approvalTimeoutAt");

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "company_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
