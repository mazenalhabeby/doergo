-- Built-in roles follow their definition in code until an admin edits them.
--
-- `isCustomized` records the edit. The lazy seed only ever CREATED built-ins,
-- so a role seeded before its definition gained a permission never got it
-- (a Sales Rep could not add clients). The service now adds what a definition
-- gains to every built-in that is not customized — additive only, never a
-- removal — at boot and when roles are listed.
--
-- Backfill: a built-in whose row was changed after it was created (the app
-- sets updatedAt on every edit) is treated as the organization's own. Raw-SQL
-- migrations do not move updatedAt, so they are not mistaken for an edit.
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "isCustomized" BOOLEAN NOT NULL DEFAULT false;

UPDATE "roles"
SET "isCustomized" = true
WHERE "isSystem" = true
  AND "updatedAt" > "createdAt" + INTERVAL '2 seconds';
