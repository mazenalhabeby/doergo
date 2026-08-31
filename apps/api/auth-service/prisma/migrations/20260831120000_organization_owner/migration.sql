-- Ownership of an organization.
--
-- Stored on the ORGANIZATION, not as a flag on the user. An organization has
-- exactly one owner, and a column holding one id is that invariant — a boolean
-- on users can drift into two owners or none, and no amount of application code
-- makes that impossible. It also answers "who owns this?" without a scan.
--
-- Nullable because the column has to exist before it can be filled, and because
-- an owner whose account row is somehow removed must leave the organization
-- standing rather than taking it with them.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;

-- One org per owner, one owner per org. A user belongs to a single organization
-- anyway, so this costs nothing and closes the door on a second one.
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_ownerId_key" ON "organizations"("ownerId");

DO $$ BEGIN
  ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: the earliest active ADMIN is who created the organization.
--
-- Sign-up makes its first user an ADMIN, so the oldest one is the founder. Where
-- an org somehow has no active admin the column stays NULL, which every guard
-- reads as "no owner yet" rather than as "everybody is the owner".
UPDATE "organizations" o
SET "ownerId" = (
  SELECT u.id FROM "users" u
  WHERE u."organizationId" = o.id AND u."role" = 'ADMIN' AND u."isActive" = true
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE o."ownerId" IS NULL;
