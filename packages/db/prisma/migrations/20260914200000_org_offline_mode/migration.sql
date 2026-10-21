-- Offline mode, switched on per organization.
--
-- The rollout switch for the offline-first mobile app: HBC first, then a pilot,
-- then everyone — and off again without a release if something goes wrong.
-- Off by default, so deploying this changes nothing for anybody until an
-- operator turns it on.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "offlineMode" BOOLEAN NOT NULL DEFAULT false;
