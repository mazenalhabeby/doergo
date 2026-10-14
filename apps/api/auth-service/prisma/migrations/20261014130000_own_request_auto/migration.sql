-- A leader's own request goes to the administrators; the only administrator's own is approved automatically.
-- Additive: one enum value, one column with a default.
ALTER TYPE "OvertimeApprovalMethod" ADD VALUE IF NOT EXISTS 'AUTOMATIC';
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "autoApproved" BOOLEAN NOT NULL DEFAULT false;
