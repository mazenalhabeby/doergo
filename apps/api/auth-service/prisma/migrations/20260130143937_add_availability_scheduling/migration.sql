-- CreateEnum
CREATE TYPE "TimeOffStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateTable
CREATE TABLE "technician_schedules" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technician_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off_requests" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "status" "TimeOffStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "technician_schedules_technicianId_idx" ON "technician_schedules"("technicianId");

-- CreateIndex
CREATE INDEX "technician_schedules_dayOfWeek_isActive_idx" ON "technician_schedules"("dayOfWeek", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "technician_schedules_technicianId_dayOfWeek_key" ON "technician_schedules"("technicianId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "time_off_requests_technicianId_idx" ON "time_off_requests"("technicianId");

-- CreateIndex
CREATE INDEX "time_off_requests_status_idx" ON "time_off_requests"("status");

-- CreateIndex
CREATE INDEX "time_off_requests_startDate_endDate_idx" ON "time_off_requests"("startDate", "endDate");

-- AddForeignKey
ALTER TABLE "technician_schedules" ADD CONSTRAINT "technician_schedules_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
