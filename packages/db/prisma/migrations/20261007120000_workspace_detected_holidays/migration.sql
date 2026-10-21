-- A workspace's country/state for public holidays, detected once from its map point. Additive.
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "detectedHolidayCountry" TEXT;
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "detectedHolidayRegion" TEXT;
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "holidayDetectedAt" TIMESTAMP(3);
