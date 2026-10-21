-- Requests: the time-off request becomes a general request (shared requests/request-kinds.ts).
-- LEAVE (every existing row) / REMOTE / HOURS / OVERTIME / OTHER, on the same table so the
-- approval flow, notification routing, calendar and offline outbox stay one.
--
-- Additive and idempotent: every existing row becomes LEAVE through the column default, so
-- nothing that reads leave today changes meaning.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RequestKind') THEN
    CREATE TYPE "RequestKind" AS ENUM ('LEAVE', 'REMOTE', 'HOURS', 'OVERTIME', 'OTHER');
  END IF;
END $$;

ALTER TABLE "time_off_requests"
  ADD COLUMN IF NOT EXISTS "kind" "RequestKind" NOT NULL DEFAULT 'LEAVE',
  ADD COLUMN IF NOT EXISTS "spaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "startTime" TEXT,
  ADD COLUMN IF NOT EXISTS "endTime" TEXT,
  ADD COLUMN IF NOT EXISTS "minutes" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_off_requests_spaceId_fkey') THEN
    ALTER TABLE "time_off_requests"
      ADD CONSTRAINT "time_off_requests_spaceId_fkey"
      FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "time_off_requests_spaceId_idx" ON "time_off_requests"("spaceId");

-- EMPTY = every kind (the same default as document visibility).
ALTER TABLE "company_locations"
  ADD COLUMN IF NOT EXISTS "requestKinds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
