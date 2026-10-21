-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "routeDistance" DOUBLE PRECISION,
ADD COLUMN     "routeEndedAt" TIMESTAMP(3),
ADD COLUMN     "routeStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "location_history" (
    "id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,

    CONSTRAINT "location_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_history_userId_timestamp_idx" ON "location_history"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "location_history_taskId_timestamp_idx" ON "location_history"("taskId", "timestamp");

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
