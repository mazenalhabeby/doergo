-- Person vs Company customers + B2B company fields + flexible custom details.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'PERSON';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "industry" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "vatId" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "regNumber" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "details" JSONB;
