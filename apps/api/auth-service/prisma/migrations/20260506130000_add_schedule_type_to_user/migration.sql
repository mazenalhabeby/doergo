-- AlterTable
ALTER TABLE "users" ADD COLUMN     "scheduleType" TEXT DEFAULT 'NONE',
ADD COLUMN     "monthlyHourBudget" DOUBLE PRECISION;
