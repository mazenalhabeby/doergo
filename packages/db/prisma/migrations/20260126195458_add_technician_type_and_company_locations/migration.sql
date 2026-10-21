-- CreateEnum
CREATE TYPE "TechnicianType" AS ENUM ('FREELANCER', 'FULL_TIME');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "technicianType" "TechnicianType" NOT NULL DEFAULT 'FREELANCER';

-- CreateTable
CREATE TABLE "company_locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geofenceRadius" INTEGER NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "company_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_locations_organizationId_idx" ON "company_locations"("organizationId");

-- CreateIndex
CREATE INDEX "company_locations_isActive_idx" ON "company_locations"("isActive");

-- AddForeignKey
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
