-- Cross-org space sharing. Additive + idempotent (shadow DB is broken → hand-authored).

-- Enums (guarded)
DO $$ BEGIN
  CREATE TYPE "SpaceShareLevel" AS ENUM ('VIEW', 'CONTRIBUTE', 'CONTROL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SpaceShareStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ShareRequestType" AS ENUM ('TASK', 'WORKER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ShareRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- space_shares
CREATE TABLE IF NOT EXISTS "space_shares" (
  "id"             TEXT NOT NULL,
  "spaceId"        TEXT NOT NULL,
  "ownerOrgId"     TEXT NOT NULL,
  "guestOrgId"     TEXT NOT NULL,
  "level"          "SpaceShareLevel" NOT NULL DEFAULT 'VIEW',
  "status"         "SpaceShareStatus" NOT NULL DEFAULT 'PENDING',
  "showWorkers"    BOOLEAN NOT NULL DEFAULT true,
  "showAttendance" BOOLEAN NOT NULL DEFAULT false,
  "showTracking"   BOOLEAN NOT NULL DEFAULT false,
  "showReports"    BOOLEAN NOT NULL DEFAULT false,
  "allowRequests"  BOOLEAN NOT NULL DEFAULT true,
  "createdById"    TEXT NOT NULL,
  "acceptedById"   TEXT,
  "acceptedAt"     TIMESTAMP(3),
  "expiresAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "space_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "space_shares_spaceId_guestOrgId_key" ON "space_shares"("spaceId", "guestOrgId");
CREATE INDEX IF NOT EXISTS "space_shares_guestOrgId_status_idx" ON "space_shares"("guestOrgId", "status");
CREATE INDEX IF NOT EXISTS "space_shares_ownerOrgId_status_idx" ON "space_shares"("ownerOrgId", "status");
CREATE INDEX IF NOT EXISTS "space_shares_spaceId_idx" ON "space_shares"("spaceId");

-- space_share_requests
CREATE TABLE IF NOT EXISTS "space_share_requests" (
  "id"            TEXT NOT NULL,
  "shareId"       TEXT NOT NULL,
  "spaceId"       TEXT NOT NULL,
  "guestOrgId"    TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "type"          "ShareRequestType" NOT NULL,
  "title"         TEXT NOT NULL,
  "note"          TEXT,
  "status"        "ShareRequestStatus" NOT NULL DEFAULT 'PENDING',
  "resolvedById"  TEXT,
  "resolvedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "space_share_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "space_share_requests_spaceId_status_idx" ON "space_share_requests"("spaceId", "status");
CREATE INDEX IF NOT EXISTS "space_share_requests_guestOrgId_status_idx" ON "space_share_requests"("guestOrgId", "status");
CREATE INDEX IF NOT EXISTS "space_share_requests_shareId_idx" ON "space_share_requests"("shareId");

DO $$ BEGIN
  ALTER TABLE "space_share_requests"
    ADD CONSTRAINT "space_share_requests_shareId_fkey"
    FOREIGN KEY ("shareId") REFERENCES "space_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
