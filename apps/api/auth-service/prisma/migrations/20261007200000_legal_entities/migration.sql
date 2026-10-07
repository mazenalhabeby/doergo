-- Companies: several legal entities in one organization (docs/plans/companies-legal-entities.md). Additive + backfill.

CREATE TABLE IF NOT EXISTS "legal_entities" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "label" TEXT,
  "addressLine1" TEXT, "addressLine2" TEXT, "postalCode" TEXT, "city" TEXT, "state" TEXT, "country" TEXT,
  "vatId" TEXT, "taxId" TEXT, "registerNumber" TEXT,
  "email" TEXT, "phone" TEXT, "website" TEXT, "logoUrl" TEXT, "currency" TEXT,
  "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
  "isMain" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "legal_entities_organizationId_idx" ON "legal_entities"("organizationId");
-- Exactly one main company per organization.
CREATE UNIQUE INDEX IF NOT EXISTS "legal_entities_one_main" ON "legal_entities"("organizationId") WHERE "isMain";
DO $$ BEGIN
  ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "legal_entity_bank_accounts" (
  "id" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "label" TEXT, "holder" TEXT, "bankName" TEXT, "iban" TEXT, "bic" TEXT, "accountNumber" TEXT, "routingNumber" TEXT, "currency" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_entity_bank_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "legal_entity_bank_accounts_legalEntityId_idx" ON "legal_entity_bank_accounts"("legalEntityId");
DO $$ BEGIN
  ALTER TABLE "legal_entity_bank_accounts" ADD CONSTRAINT "legal_entity_bank_accounts_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employerEntityId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "issuer" JSONB;
DO $$ BEGIN
  ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_employerEntityId_fkey" FOREIGN KEY ("employerEntityId") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- BACKFILL 1: one MAIN company per organization, copied from its profile, prefix INV — so every
-- existing invoice series simply continues.
INSERT INTO "legal_entities" ("id","organizationId","legalName","addressLine1","addressLine2","postalCode","city","state","country","vatId","email","phone","website","logoUrl","currency","invoicePrefix","isMain","updatedAt")
SELECT 'le' || substr(md5(o."id" || ':main'), 1, 23), o."id", o."name",
       COALESCE(o."addressLine1", o."address"), o."addressLine2", o."postalCode", o."city", o."state", o."country",
       o."vatId", o."email", o."phone", o."website", o."logoUrl", o."currency", 'INV', true, CURRENT_TIMESTAMP
FROM "organizations" o
WHERE NOT EXISTS (SELECT 1 FROM "legal_entities" l WHERE l."organizationId" = o."id" AND l."isMain");

-- BACKFILL 2: every existing invoice was issued by the organization's main company.
UPDATE "invoices" i SET "legalEntityId" = l."id"
FROM "legal_entities" l
WHERE i."legalEntityId" IS NULL AND l."organizationId" = i."organizationId" AND l."isMain";

-- BACKFILL 3: freeze the issuer of every invoice already past DRAFT, as the profile reads today —
-- from now on an address change never rewrites them.
UPDATE "invoices" i SET "issuer" = jsonb_build_object(
    'legalEntityId', l."id", 'legalName', l."legalName", 'label', l."label",
    'addressLine1', l."addressLine1", 'addressLine2', l."addressLine2", 'postalCode', l."postalCode",
    'city', l."city", 'state', l."state", 'country', l."country", 'vatId', l."vatId", 'taxId', l."taxId",
    'registerNumber', l."registerNumber", 'email', l."email", 'phone', l."phone", 'website', l."website",
    'logoUrl', l."logoUrl", 'currency', l."currency", 'invoicePrefix', l."invoicePrefix", 'bank', NULL,
    'frozenAt', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
FROM "legal_entities" l
WHERE i."issuer" IS NULL AND i."status" <> 'DRAFT' AND l."id" = i."legalEntityId";
