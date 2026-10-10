-- Operator console hardening (2026-10-10). Additive and idempotent.

-- 1. A 2FA secret being enrolled is held apart from the one in force, so starting
--    a setup can no longer switch the active factor off.
ALTER TABLE "platform_users" ADD COLUMN IF NOT EXISTS "twoFactorPendingSecret" TEXT;

-- 2. The operator audit trail. The tenant audit log is keyed by organization and
--    skipped every platform request (they carry no organization), so every
--    suspension, billing change and price agreement went unrecorded.
CREATE TABLE IF NOT EXISTS "platform_audit_logs" (
  "id" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "actorLabel" TEXT,
  "actorRole" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "method" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetOrganizationId" TEXT,
  "summary" JSONB,
  "ok" BOOLEAN NOT NULL,
  "statusCode" INTEGER,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "platform_audit_logs_createdAt_idx" ON "platform_audit_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "platform_audit_logs_actorId_createdAt_idx" ON "platform_audit_logs"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "platform_audit_logs_targetOrganizationId_createdAt_idx" ON "platform_audit_logs"("targetOrganizationId", "createdAt");

-- 3. Append-only, enforced by the database as well as by the absence of a code
--    path: an audit trail an operator could edit is not evidence of anything.
--    (A future retention job must drop this trigger deliberately, in a migration.)
CREATE OR REPLACE FUNCTION platform_audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_audit_logs_no_update ON "platform_audit_logs";
CREATE TRIGGER platform_audit_logs_no_update
  BEFORE UPDATE OR DELETE ON "platform_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION platform_audit_logs_append_only();
