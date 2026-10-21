-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('CLOCKED_IN', 'CLOCKED_OUT', 'AUTO_OUT');

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'CLOCKED_IN',
    "clockInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockInLat" DOUBLE PRECISION NOT NULL,
    "clockInLng" DOUBLE PRECISION NOT NULL,
    "clockInAccuracy" DOUBLE PRECISION,
    "clockOutAt" TIMESTAMP(3),
    "clockOutLat" DOUBLE PRECISION,
    "clockOutLng" DOUBLE PRECISION,
    "clockOutAccuracy" DOUBLE PRECISION,
    "clockInWithinGeofence" BOOLEAN NOT NULL DEFAULT true,
    "clockOutWithinGeofence" BOOLEAN,
    "totalMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_entries_userId_clockInAt_idx" ON "time_entries"("userId", "clockInAt");

-- CreateIndex
CREATE INDEX "time_entries_locationId_idx" ON "time_entries"("locationId");

-- CreateIndex
CREATE INDEX "time_entries_organizationId_idx" ON "time_entries"("organizationId");

-- CreateIndex
CREATE INDEX "time_entries_status_idx" ON "time_entries"("status");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "company_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
