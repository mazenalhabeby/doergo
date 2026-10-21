-- Opt-in capability: org distinguishes in-house vs external field workers.
-- Default false → the in-house/external concept is hidden and all field seats
-- bill at the standard rate until an org enables it (from industry or Settings).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "usesExternalWorkers" BOOLEAN NOT NULL DEFAULT false;
