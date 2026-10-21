-- The recipient's language, so a push can be written in it.
--
-- A notification is composed on the server, at the moment the event happens,
-- for somebody whose app is not open. Until now the server had no idea what
-- language that person reads, so every push and every bell entry went out in
-- English to a workforce that mostly does not.
--
-- NULL means "never told" — every existing member, and anybody on an app build
-- that predates this — and is read as English. Nothing is backfilled: guessing a
-- language from a country would be wrong for exactly the people who most need
-- it right.
--
-- Additive and idempotent: the shadow database is broken here, so migrations
-- are hand-authored and must be safe to re-run.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" TEXT;
