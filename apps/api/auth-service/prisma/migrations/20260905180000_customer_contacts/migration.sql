-- Contact people: the person record who works at a company.
--
-- Additive and reversible. Hand-authored and idempotent — the shadow database on
-- this project is broken, so `migrate dev` is never used and every statement has
-- to survive a re-run.

-- A person created as somebody's contact is not a client of yours: kept out of
-- the CRM list by default and out of the billable client count.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "isContact" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "customer_contacts" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "personId"       TEXT NOT NULL,
  "role"           TEXT,
  "isPrimary"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- Nobody added twice, enforced by the database rather than by a check-then-write
-- the second click of a double-click can slip between.
CREATE UNIQUE INDEX IF NOT EXISTS "customer_contacts_companyId_personId_key"
  ON "customer_contacts" ("companyId", "personId");
-- "Who does this person work for?"
CREATE INDEX IF NOT EXISTS "customer_contacts_personId_idx" ON "customer_contacts" ("personId");
-- "Who do I ring at this company?" — primary first.
CREATE INDEX IF NOT EXISTS "customer_contacts_companyId_isPrimary_idx"
  ON "customer_contacts" ("companyId", "isPrimary");

DO $$ BEGIN
  ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
