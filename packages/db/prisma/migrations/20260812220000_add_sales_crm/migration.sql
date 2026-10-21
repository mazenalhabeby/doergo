-- Sales / CRM module: contacts, leads, pipelines, deals, activities, quotes,
-- commissions. Additive + idempotent (shadow DB is broken → hand-authored).
-- Money stored as integer minor units (cents). All tables org-scoped.

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "LeadStatus" AS ENUM ('NEW','WORKING','QUALIFIED','UNQUALIFIED','CONVERTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SalesActivityType" AS ENUM ('CALL','EMAIL','NOTE','MEETING','VISIT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT','SENT','ACCEPTED','DECLINED','EXPIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CommissionBasis" AS ENUM ('BOOKED','PAID'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CommissionEntryStatus" AS ENUM ('PENDING','APPROVED','PAID','CANCELED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── contacts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contacts" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "spaceId"        TEXT,
  "firstName"      TEXT NOT NULL,
  "lastName"       TEXT,
  "title"          TEXT,
  "email"          TEXT,
  "phone"          TEXT,
  "isPrimary"      BOOLEAN NOT NULL DEFAULT false,
  "ownerId"        TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "contacts_organizationId_spaceId_idx" ON "contacts" ("organizationId","spaceId");
CREATE INDEX IF NOT EXISTS "contacts_organizationId_ownerId_idx" ON "contacts" ("organizationId","ownerId");

-- ── leads ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "leads" (
  "id"                 TEXT NOT NULL,
  "organizationId"     TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "company"            TEXT,
  "email"              TEXT,
  "phone"              TEXT,
  "source"             TEXT,
  "status"             "LeadStatus" NOT NULL DEFAULT 'NEW',
  "ownerId"            TEXT,
  "notes"              TEXT,
  "address"            TEXT,
  "lat"                DOUBLE PRECISION,
  "lng"                DOUBLE PRECISION,
  "convertedSpaceId"   TEXT,
  "convertedContactId" TEXT,
  "convertedDealId"    TEXT,
  "convertedAt"        TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "leads_organizationId_status_idx" ON "leads" ("organizationId","status");
CREATE INDEX IF NOT EXISTS "leads_organizationId_ownerId_status_idx" ON "leads" ("organizationId","ownerId","status");

-- ── pipelines ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pipelines" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "isDefault"      BOOLEAN NOT NULL DEFAULT false,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "position"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pipelines_organizationId_idx" ON "pipelines" ("organizationId");

-- ── pipeline_stages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pipeline_stages" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pipelineId"     TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "position"       INTEGER NOT NULL,
  "probability"    INTEGER NOT NULL DEFAULT 0,
  "isWon"          BOOLEAN NOT NULL DEFAULT false,
  "isLost"         BOOLEAN NOT NULL DEFAULT false,
  "color"          TEXT DEFAULT '#6b7280',
  CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pipeline_stages_pipelineId_position_idx" ON "pipeline_stages" ("pipelineId","position");
CREATE INDEX IF NOT EXISTS "pipeline_stages_organizationId_idx" ON "pipeline_stages" ("organizationId");

-- ── deals ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "deals" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "spaceId"         TEXT,
  "contactId"       TEXT,
  "leadId"          TEXT,
  "ownerId"         TEXT,
  "pipelineId"      TEXT NOT NULL,
  "stageId"         TEXT NOT NULL,
  "amountCents"     INTEGER NOT NULL DEFAULT 0,
  "currency"        TEXT NOT NULL DEFAULT 'EUR',
  "expectedCloseAt" TIMESTAMP(3),
  "closedAt"        TIMESTAMP(3),
  "isWon"           BOOLEAN NOT NULL DEFAULT false,
  "isLost"          BOOLEAN NOT NULL DEFAULT false,
  "wonReason"       TEXT,
  "lostReason"      TEXT,
  "source"          TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "deals_organizationId_stageId_idx" ON "deals" ("organizationId","stageId");
CREATE INDEX IF NOT EXISTS "deals_organizationId_ownerId_idx" ON "deals" ("organizationId","ownerId");
CREATE INDEX IF NOT EXISTS "deals_organizationId_spaceId_idx" ON "deals" ("organizationId","spaceId");

-- ── sales_activities ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sales_activities" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type"           "SalesActivityType" NOT NULL,
  "ownerId"        TEXT,
  "leadId"         TEXT,
  "dealId"         TEXT,
  "contactId"      TEXT,
  "spaceId"        TEXT,
  "taskId"         TEXT,
  "subject"        TEXT,
  "body"           TEXT,
  "dueAt"          TIMESTAMP(3),
  "doneAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "sales_activities_organizationId_dealId_idx" ON "sales_activities" ("organizationId","dealId");
CREATE INDEX IF NOT EXISTS "sales_activities_organizationId_leadId_idx" ON "sales_activities" ("organizationId","leadId");
CREATE INDEX IF NOT EXISTS "sales_activities_organizationId_ownerId_dueAt_idx" ON "sales_activities" ("organizationId","ownerId","dueAt");

-- ── quotes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "quotes" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "quoteNumber"    TEXT NOT NULL,
  "status"         "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "dealId"         TEXT,
  "spaceId"        TEXT,
  "contactId"      TEXT,
  "clientName"     TEXT NOT NULL,
  "clientEmail"    TEXT,
  "clientAddress"  TEXT,
  "lineItems"      JSONB NOT NULL DEFAULT '[]',
  "subtotalCents"  INTEGER NOT NULL DEFAULT 0,
  "taxRate"        DOUBLE PRECISION,
  "taxCents"       INTEGER NOT NULL DEFAULT 0,
  "discountCents"  INTEGER NOT NULL DEFAULT 0,
  "totalCents"     INTEGER NOT NULL DEFAULT 0,
  "currency"       TEXT NOT NULL DEFAULT 'EUR',
  "validUntil"     TIMESTAMP(3),
  "sentAt"         TIMESTAMP(3),
  "acceptedAt"     TIMESTAMP(3),
  "notes"          TEXT,
  "invoiceId"      TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_organizationId_quoteNumber_key" ON "quotes" ("organizationId","quoteNumber");
CREATE INDEX IF NOT EXISTS "quotes_organizationId_status_idx" ON "quotes" ("organizationId","status");
CREATE INDEX IF NOT EXISTS "quotes_organizationId_dealId_idx" ON "quotes" ("organizationId","dealId");

-- ── commission_rules ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "commission_rules" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "percent"        DOUBLE PRECISION NOT NULL,
  "basis"          "CommissionBasis" NOT NULL DEFAULT 'PAID',
  "userId"         TEXT,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "commission_rules_organizationId_isActive_idx" ON "commission_rules" ("organizationId","isActive");

-- ── commission_entries ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "commission_entries" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownerId"        TEXT NOT NULL,
  "ruleId"         TEXT,
  "dealId"         TEXT,
  "quoteId"        TEXT,
  "invoiceId"      TEXT,
  "baseCents"      INTEGER NOT NULL,
  "percent"        DOUBLE PRECISION NOT NULL,
  "amountCents"    INTEGER NOT NULL,
  "period"         TEXT NOT NULL,
  "status"         "CommissionEntryStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "commission_entries_organizationId_ownerId_period_idx" ON "commission_entries" ("organizationId","ownerId","period");
CREATE INDEX IF NOT EXISTS "commission_entries_organizationId_status_idx" ON "commission_entries" ("organizationId","status");

-- ── Foreign keys (guarded so re-run is safe) ─────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "deals" ADD CONSTRAINT "deals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "deals" ADD CONSTRAINT "deals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "deals" ADD CONSTRAINT "deals_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "deals" ADD CONSTRAINT "deals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
