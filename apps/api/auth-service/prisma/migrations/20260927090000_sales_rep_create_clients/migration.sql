-- The built-in Sales Rep role gained `crmCreateClients` ("add clients") after
-- many organizations had already been seeded with it, and the lazy seed in
-- listAccessRoles never updates an existing role. Those reps could not add a
-- client — the server refused and the phone hid the tiles.
--
-- Adds the grant to every built-in Sales Rep role that has never had the key.
-- A role where an admin set it (true OR false) is left exactly as it is.
-- Idempotent: a second run matches nothing.
UPDATE "roles"
SET "permissions" = "permissions"::jsonb || '{"crmCreateClients": true}'::jsonb,
    "updatedAt"   = NOW()
WHERE "slug" = 'sales-rep'
  AND "isSystem" = true
  AND NOT ("permissions"::jsonb ? 'crmCreateClients');
