-- AlterTable: Add profile badges config to organizations (org-wide defaults)
ALTER TABLE "organizations" ADD COLUMN "profileBadges" JSONB;

-- AlterTable: Add profile badges override to users (per-user, null = use org default)
ALTER TABLE "users" ADD COLUMN "profileBadges" JSONB;
