-- AlterTable
ALTER TABLE "users" ADD COLUMN     "maxDailyJobs" INTEGER DEFAULT 5,
ADD COLUMN     "rating" DOUBLE PRECISION DEFAULT 5.0,
ADD COLUMN     "ratingCount" INTEGER DEFAULT 0,
ADD COLUMN     "specialty" TEXT;
