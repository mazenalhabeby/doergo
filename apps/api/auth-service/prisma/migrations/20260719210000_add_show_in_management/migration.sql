-- "Show in Management" split OUT of chat `contactable` into its own flag.
-- `contactable` now means chat reachability only; `showInManagement` controls
-- whether a member is listed in the org "Management" directory (reach leadership).
-- Admins always appear via a role check, so this defaults to false (opt-in).
-- Idempotent + safe for prod drift.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "showInManagement" BOOLEAN NOT NULL DEFAULT false;
