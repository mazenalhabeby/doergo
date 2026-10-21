-- The automatic clock (packages/shared/src/attendance/auto-clock.ts).
--
-- Additive and idempotent. Every default is "off": no workspace has settings
-- (NULL), no member is chosen (false), nobody has consented (NULL) — so nothing
-- behaves differently until a workspace switches it on, picks members, and each
-- member consents in the app.

ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "autoClock" JSONB;

ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "autoClock" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "autoClockConsentAt" TIMESTAMP(3);

ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "autoRestSkippedAt" TIMESTAMP(3);
