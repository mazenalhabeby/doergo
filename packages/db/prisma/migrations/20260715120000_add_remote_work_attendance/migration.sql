-- Remote work attendance. Idempotent (ADD COLUMN IF NOT EXISTS) to survive the
-- prod schema drift where the shadow-DB replay path is unavailable.

-- Per-worker eligibility to clock in remotely (WFH/anywhere).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "allowRemote" BOOLEAN NOT NULL DEFAULT false;

-- Marks a per-org "Remote" bucket location (no coords, geofence-exempt, hidden from pickers).
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "isRemote" BOOLEAN NOT NULL DEFAULT false;

-- Remote time entries: geofence-exempt, with a coarse reverse-geocoded place.
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "isRemote" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "clockInPlace" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "clockOutPlace" TEXT;
