-- What version of the app each member is actually running.
--
-- There was no answer to this anywhere. The only appVersion column in the
-- schema sat on document_events, which only builds from 1.0.3 write, so
-- "who is still on the old build" could not be asked — and on 2026-08-31 that
-- turned a crash affecting every Play Store user into something nobody could
-- scope or target.
--
-- Recorded from a header the app sends, written only when it CHANGES, so the
-- steady state costs no writes at all.
--
-- Additive and idempotent: the shadow database this project would need for
-- `migrate dev` is broken, so migrations are hand-authored.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastAppVersion"  TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastAppPlatform" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastAppSeenAt"   TIMESTAMP(3);

-- Answering "who is behind" is a scan over one organization's members, so the
-- version leads and the organization scopes it.
CREATE INDEX IF NOT EXISTS "users_organizationId_lastAppVersion_idx"
  ON "users" ("organizationId", "lastAppVersion");
