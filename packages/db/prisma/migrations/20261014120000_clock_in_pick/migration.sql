-- A member with several workspaces: clock in where they stand (AUTO, today's
-- behaviour and the default) or always choose (ASK). Additive.
ALTER TABLE "users" ADD COLUMN "clockInPick" TEXT NOT NULL DEFAULT 'AUTO';
