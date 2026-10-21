-- The personnel file: documents that belong to a PERSON, not a task.
--
-- Purely ADDITIVE. Five new tables and six new enums; not one existing column
-- is altered, renamed or dropped. That is what makes this safe to apply to a
-- database whose shadow DB is broken and which therefore never sees
-- `migrate dev` — every statement below is idempotent and can be re-run.
--
-- Bytes are NOT stored here. `documents.storageKey` points at a
-- content-addressed object and `documents.sha256` is what it hashes to, so the
-- key is the integrity check rather than a second field to keep in sync.

-- ── Enums (CREATE TYPE has no IF NOT EXISTS) ────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "DocumentCadence" AS ENUM ('MONTHLY', 'ANNUAL', 'ONE_OFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentDirection" AS ENUM ('ISSUED', 'SUPPLIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureMode" AS ENUM ('NONE', 'ACKNOWLEDGE', 'IN_APP', 'WET_INK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'AWAITING_SIGNATURE', 'SIGNED', 'EXPIRED', 'SUPERSEDED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentEventType" AS ENUM ('ISSUED', 'DELIVERED', 'OPENED', 'DOWNLOADED', 'CONSENTED', 'SIGNED', 'SEALED', 'ACKNOWLEDGED', 'VERIFIED', 'REVOKED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── document_types ──────────────────────────────────────────────────────────
-- A credential is just a type with isCredential + an expiry. No separate
-- credentials table: a driving licence is a document that happens to run out.
CREATE TABLE IF NOT EXISTS "document_types" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "cadence" "DocumentCadence" NOT NULL DEFAULT 'ONE_OFF',
  "direction" "DocumentDirection" NOT NULL DEFAULT 'ISSUED',
  "retentionMonths" INTEGER,
  "signatureMode" "SignatureMode" NOT NULL DEFAULT 'NONE',
  "isCredential" BOOLEAN NOT NULL DEFAULT false,
  "hasExpiry" BOOLEAN NOT NULL DEFAULT false,
  "requiredForWorkflowIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- ── document_templates ──────────────────────────────────────────────────────
-- Bound to a role and a job title, both of which the Invitation already
-- carries — so auto-issuing a contract on acceptance needed no new columns
-- anywhere else.
CREATE TABLE IF NOT EXISTS "document_templates" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "appliesToRoleId" TEXT,
  "appliesToPosition" TEXT,
  "signatureMode" "SignatureMode" NOT NULL DEFAULT 'IN_APP',
  "offerValidDays" INTEGER DEFAULT 14,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- ── documents ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "documents" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "templateId" TEXT,
  "title" TEXT NOT NULL,
  "periodYear" INTEGER,
  "periodMonth" INTEGER,
  "storageKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "status" "DocumentStatus" NOT NULL DEFAULT 'ISSUED',
  "issuedById" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "firstOpenedAt" TIMESTAMP(3),
  "expiresOn" DATE,
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" TEXT,
  "retentionUntil" TIMESTAMP(3),
  "supersedesId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- ── document_signatures ─────────────────────────────────────────────────────
-- The drawing lives in object storage, NOT inline. Three columns elsewhere in
-- this schema hold base64 PNGs in TEXT; this deliberately does not repeat it.
CREATE TABLE IF NOT EXISTS "document_signatures" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "signatureKey" TEXT NOT NULL,
  "signatureSha256" TEXT NOT NULL,
  "consentText" TEXT NOT NULL,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hashBefore" TEXT NOT NULL,
  "hashAfter" TEXT NOT NULL,
  "sealedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  CONSTRAINT "document_signatures_pkey" PRIMARY KEY ("id")
);

-- ── document_events ─────────────────────────────────────────────────────────
-- Append-only by contract: no UPDATE path is written and no service method
-- exposes one. This is the evidence trail.
CREATE TABLE IF NOT EXISTS "document_events" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "type" "DocumentEventType" NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "appVersion" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "meta" JSONB,
  CONSTRAINT "document_events_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "document_types_organizationId_key_key" ON "document_types"("organizationId", "key");
CREATE INDEX IF NOT EXISTS "document_types_organizationId_isActive_idx" ON "document_types"("organizationId", "isActive");
-- The dispatch gate's first question: does this org gate anything at all?
CREATE INDEX IF NOT EXISTS "document_types_organizationId_isCredential_idx" ON "document_types"("organizationId", "isCredential");

CREATE INDEX IF NOT EXISTS "document_templates_organizationId_isActive_idx" ON "document_templates"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "document_templates_organizationId_appliesToRoleId_appliesToP_idx" ON "document_templates"("organizationId", "appliesToRoleId", "appliesToPosition");

-- The member's own list: their documents, by type, newest year first.
CREATE INDEX IF NOT EXISTS "documents_userId_typeId_periodYear_idx" ON "documents"("userId", "typeId", "periodYear");
-- The admin list and the batch view.
CREATE INDEX IF NOT EXISTS "documents_organizationId_status_idx" ON "documents"("organizationId", "status");
-- The compliance board: what expires soon, org-wide.
CREATE INDEX IF NOT EXISTS "documents_organizationId_expiresOn_idx" ON "documents"("organizationId", "expiresOn");
-- Dedup lookups: the same bytes issued to thirty people are one object.
CREATE INDEX IF NOT EXISTS "documents_organizationId_sha256_idx" ON "documents"("organizationId", "sha256");
CREATE UNIQUE INDEX IF NOT EXISTS "documents_supersedesId_key" ON "documents"("supersedesId");

CREATE UNIQUE INDEX IF NOT EXISTS "document_signatures_documentId_key" ON "document_signatures"("documentId");
-- Makes signing safely retryable: a dropped connection returns the existing
-- seal rather than signing a second time.
CREATE UNIQUE INDEX IF NOT EXISTS "document_signatures_idempotencyKey_key" ON "document_signatures"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "document_signatures_userId_idx" ON "document_signatures"("userId");

CREATE INDEX IF NOT EXISTS "document_events_documentId_at_idx" ON "document_events"("documentId", "at");

-- ── Foreign keys (guarded: ADD CONSTRAINT has no IF NOT EXISTS) ─────────────
DO $$ BEGIN
  ALTER TABLE "document_types" ADD CONSTRAINT "document_types_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "document_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_appliesToRoleId_fkey"
    FOREIGN KEY ("appliesToRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESTRICT, not CASCADE: deleting a document type must not silently delete
-- every payslip filed under it.
DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_issuedById_fkey"
    FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_supersedesId_fkey"
    FOREIGN KEY ("supersedesId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_events" ADD CONSTRAINT "document_events_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_events" ADD CONSTRAINT "document_events_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
