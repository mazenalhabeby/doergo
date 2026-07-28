-- Per-user clock display preference: "24h" (default) or "12h" (AM/PM).
-- Display-only — does not affect stored timestamps or any server logic.
-- Idempotent + safe for prod drift (column may be added out-of-band).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timeFormat" TEXT DEFAULT '24h';

-- Backfill any existing NULLs to the default so the app never has to guess.
UPDATE "users" SET "timeFormat" = '24h' WHERE "timeFormat" IS NULL;
