-- Working away from a site: a ceiling on the workspace, a grant on the person.
--
-- Both columns default to today's behaviour exactly. Every workspace starts
-- STRICT, and every assignment starts NULL — "follow the account" — so on the
-- day this deploys the effective answer everywhere is the one the product gives
-- now: the existing `users.allowRemote` flag, and nothing else.
--
-- Hand-authored and idempotent; the shadow database on this project is broken,
-- so `migrate dev` is never used and every statement must survive a re-run.

ALTER TABLE "company_locations"
  ADD COLUMN IF NOT EXISTS "geofencePolicy" TEXT NOT NULL DEFAULT 'STRICT';

ALTER TABLE "space_assignments"
  ADD COLUMN IF NOT EXISTS "allowRemote" BOOLEAN;
