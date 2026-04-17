-- Drop the overly restrictive unique index
DROP INDEX IF EXISTS "join_requests_userId_organizationId_status_key";
ALTER TABLE "join_requests" DROP CONSTRAINT IF EXISTS "join_requests_userId_organizationId_status_key";

-- Replace with a regular index
CREATE INDEX IF NOT EXISTS "join_requests_userId_organizationId_status_idx" ON "join_requests"("userId", "organizationId", "status");
