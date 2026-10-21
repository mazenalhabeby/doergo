-- External members: a client's or partner's supervisor who holds a login to our
-- tenant, a space role, and nothing else.
--
-- Additive and idempotent. Every existing member defaults to internal, so the
-- meaning of every existing row is unchanged and no backfill is required.
--
-- WHICH company they work for is deliberately not stored. An external member is
-- assigned to exactly one workspace and that workspace already names the client,
-- so a second column would restate it by hand and be free to disagree with it.
--
-- No index: the queries that care filter `isExternal = false`, which is nearly
-- every row, so an index would never be chosen. The existing `organizationId`
-- scoping is what actually narrows those reads.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isExternal" BOOLEAN NOT NULL DEFAULT false;

-- The same fact on the invitation, so somebody is external from their very
-- first session rather than being corrected into it after they join.
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "isExternal" BOOLEAN NOT NULL DEFAULT false;
