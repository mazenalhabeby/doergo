-- Optional link: the space a portal routes its client requests to.
-- fk-less (validated in the service), so a deleted space just falls back to
-- manual triage rather than cascading.
ALTER TABLE "portals" ADD COLUMN IF NOT EXISTS "spaceId" TEXT;
