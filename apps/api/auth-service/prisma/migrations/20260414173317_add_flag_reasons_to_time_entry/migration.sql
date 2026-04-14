-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "flagReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];
