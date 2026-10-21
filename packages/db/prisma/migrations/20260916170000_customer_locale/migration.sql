-- The language email to a CLIENT is written in.
--
-- A member's language arrived with 20260916140000_user_locale: the app reports
-- it. A client mostly never signs in, so nothing reports theirs — the office
-- sets it on the client record, and a signing link or a portal invitation is
-- written in it.
--
-- NULL means "not set" and changes nothing on its own: the account behind the
-- address still wins, then the organization's country where it states one
-- language, then English. Nothing is backfilled — the office chooses.
--
-- Additive and idempotent: the shadow database is broken here, so migrations
-- are hand-authored and must be safe to re-run.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "locale" TEXT;
