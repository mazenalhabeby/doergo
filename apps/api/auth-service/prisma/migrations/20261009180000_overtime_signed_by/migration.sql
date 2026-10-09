-- Path B overtime: a signature on the technician's phone is a request the named
-- approver confirms from their own session. Additive.
ALTER TABLE "overtime_requests" ADD COLUMN IF NOT EXISTS "signedById" TEXT;
ALTER TABLE "overtime_requests" ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMP(3);
