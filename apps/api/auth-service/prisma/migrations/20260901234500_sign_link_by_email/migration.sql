-- The signing link is addressed to an EMAIL, not to a client record.
--
-- Keying on customerId served exactly one of the three kinds of counterparty a
-- CUSTOMER step can have, and left the other two unable to hold a link at all:
--
--   • a CUSTOMER-kind space, which already carries its own contact
--   • a CRM client, when that module is on for the space
--   • somebody typed in for one document, who has no record anywhere
--
-- The address is the only identity all three have. It is also the right SCOPE:
-- a link resolves the signer rows addressed to that address, so a one-off
-- contact sees the one document sent to them and never a client's history.
--
-- Written before anything used the old shape, so there is no data to carry.

ALTER TABLE "customer_sign_links" ADD COLUMN IF NOT EXISTS "email" TEXT;

-- Backfill from the client, then make it required. Empty in practice — the
-- feature shipped hours ago and nothing has issued a customer step yet — but a
-- migration that assumes that and is wrong is a migration that fails at 3am.
UPDATE "customer_sign_links" l
   SET "email" = c."email"
  FROM "customers" c
 WHERE c."id" = l."customerId" AND l."email" IS NULL AND c."email" IS NOT NULL;

-- A link nobody can be reached through is not a link.
DELETE FROM "customer_sign_links" WHERE "email" IS NULL;

ALTER TABLE "customer_sign_links" ALTER COLUMN "email" SET NOT NULL;

-- customerId becomes provenance: which CRM client this was, when there was one.
-- Never what the link resolves by, so changing a client's address tomorrow
-- cannot redirect a document already in flight.
ALTER TABLE "customer_sign_links" ALTER COLUMN "customerId" DROP NOT NULL;

ALTER TABLE "customer_sign_links" DROP CONSTRAINT IF EXISTS "customer_sign_links_customerId_fkey";
DO $$ BEGIN
  ALTER TABLE "customer_sign_links" ADD CONSTRAINT "customer_sign_links_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP INDEX IF EXISTS "customer_sign_links_organizationId_customerId_key";
-- One live link per address. Re-issuing replaces the hash and kills the old
-- one: two live links is two people able to sign as the same counterparty.
CREATE UNIQUE INDEX IF NOT EXISTS "customer_sign_links_organizationId_email_key"
  ON "customer_sign_links" ("organizationId", "email");

-- ── Who a step is addressed to, when they are nobody on file ────────────────
-- A space's contact, or a name typed for this one document. `email` already
-- existed on this table for exactly this purpose and had never been populated.
ALTER TABLE "document_signers" ADD COLUMN IF NOT EXISTS "contactName" TEXT;

-- The link resolves signer rows BY address, so it must be indexed — and frozen
-- at issue, which is why it lives here rather than being read from the client.
CREATE INDEX IF NOT EXISTS "document_signers_email_status_idx"
  ON "document_signers" ("email", "status");
