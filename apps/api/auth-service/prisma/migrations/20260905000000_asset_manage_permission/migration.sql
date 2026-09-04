-- Asset WRITES move from `canViewAllTasks` to `canManageAssets`.
--
-- `canManageAssets` exists precisely for this and was being bypassed: creating,
-- editing and deleting the organization's equipment was authorised by a READ
-- permission. That is how somebody given sight of the work quietly gains the
-- ability to change the asset register.
--
-- A straight swap would be a regression, not a fix: today `canManageAssets` is
-- held ONLY by Admin, while `canViewAllTasks` is held by Manager and Space
-- Manager too. Every one of them can add an asset today and must still be able
-- to tomorrow — a security tidy-up that takes a capability away from working
-- customers is a bug with a good excuse.
--
-- So the permission is granted to every role that already had the ability
-- through the old gate. Nobody gains anything; the same people keep doing the
-- same thing, through the right permission.
--
-- EXCEPT the two external built-ins. An external member has no claim on the
-- organization's equipment — the asset controllers are @DenyExternal already —
-- and granting it on the role would be a grant that contradicts the door.

UPDATE "roles"
   SET "permissions" = jsonb_set("permissions"::jsonb, '{canManageAssets}', 'true'::jsonb, true)
 WHERE "permissions"->>'canViewAllTasks' = 'true'
   AND COALESCE("permissions"->>'canManageAssets', 'false') <> 'true'
   AND "slug" NOT IN ('external-supervisor', 'external-observer');
