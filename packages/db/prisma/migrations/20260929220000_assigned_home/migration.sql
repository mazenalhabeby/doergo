-- A home screen the office set up for a member; applied once by the phone.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "assignedHome" JSONB;
