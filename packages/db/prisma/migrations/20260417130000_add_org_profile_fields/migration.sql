-- Organization profile fields
ALTER TABLE "organizations" ADD COLUMN "industry" TEXT;
ALTER TABLE "organizations" ADD COLUMN "address" TEXT;
ALTER TABLE "organizations" ADD COLUMN "phone" TEXT;
ALTER TABLE "organizations" ADD COLUMN "email" TEXT;
ALTER TABLE "organizations" ADD COLUMN "website" TEXT;
ALTER TABLE "organizations" ADD COLUMN "timezone" TEXT DEFAULT 'Europe/Vienna';
ALTER TABLE "organizations" ADD COLUMN "logoUrl" TEXT;

-- Organization settings (JSON)
ALTER TABLE "organizations" ADD COLUMN "notificationPrefs" JSONB;
ALTER TABLE "organizations" ADD COLUMN "securitySettings" JSONB;
