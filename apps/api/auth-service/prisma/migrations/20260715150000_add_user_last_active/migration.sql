-- Last-active timestamp for online / last-seen presence.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);
