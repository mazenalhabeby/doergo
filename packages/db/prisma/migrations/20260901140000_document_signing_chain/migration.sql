-- Multi-party document signing: a document can carry a chain of signatures.
--
-- A document could be signed by exactly one person, enforced by a unique index
-- on document_signatures.documentId. That is right for a payslip and wrong for
-- a time sheet, which has to travel: the worker signs their hours, their
-- responsible signs to say the agency stands behind them, and the client
-- countersigns to accept the charge — all three on the SAME document.
--
-- Additive and idempotent throughout. The shadow database this project would
-- need for `migrate dev` is broken, so migrations are hand-authored, and the
-- only destructive step is dropping a unique index, which widens what is legal
-- rather than removing anything.
--
-- Nothing changes for existing documents: a type with no signerRoute keeps
-- single-signature behaviour exactly as before.

-- ── Routing: a third kind, beside notify and contact ─────────────────────────
-- "Who signs off for this member" is deliberately not "who is told about them".
-- Wanting to hear about somebody's shifts is not authority over their hours.
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "approveRoleIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "approveUserIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "approveRoleIds" TEXT[] NOT NULL DEFAULT '{}';

-- ── The document as issued ───────────────────────────────────────────────────
-- Each signature re-renders from the original: original + ONE signature block +
-- ONE certificate. Without it, adding a signature can only append another pair
-- of pages, so three signers would produce six.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "originalKey" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "originalSha256" TEXT;

-- ── The route template, on the type ──────────────────────────────────────────
-- NULL means today's behaviour: one signature, by the member.
ALTER TABLE "document_types" ADD COLUMN IF NOT EXISTS "signerRoute" JSONB;

-- ── The steps ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "DocumentSignerRole" AS ENUM ('MEMBER', 'RESPONSIBLE', 'ORG_REPRESENTATIVE', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentSignerStatus" AS ENUM ('PENDING', 'SIGNED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "document_signers" (
  "id"             TEXT NOT NULL,
  "documentId"     TEXT NOT NULL,
  "order"          INTEGER NOT NULL,
  "role"           "DocumentSignerRole" NOT NULL,
  "userId"         TEXT,
  "customerId"     TEXT,
  "email"          TEXT,
  "status"         "DocumentSignerStatus" NOT NULL DEFAULT 'PENDING',
  "notifiedAt"     TIMESTAMP(3),
  "signedAt"       TIMESTAMP(3),
  "tokenHash"      TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_signers_pkey" PRIMARY KEY ("id")
);

-- One signer per position: a route cannot fork or duplicate a step.
CREATE UNIQUE INDEX IF NOT EXISTS "document_signers_documentId_order_key"
  ON "document_signers" ("documentId", "order");
CREATE UNIQUE INDEX IF NOT EXISTS "document_signers_tokenHash_key"
  ON "document_signers" ("tokenHash");
-- "What is waiting for me" — the question every signer's home screen asks.
CREATE INDEX IF NOT EXISTS "document_signers_userId_status_idx"
  ON "document_signers" ("userId", "status");
CREATE INDEX IF NOT EXISTS "document_signers_documentId_status_idx"
  ON "document_signers" ("documentId", "status");

DO $$ BEGIN
  ALTER TABLE "document_signers" ADD CONSTRAINT "document_signers_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_signers" ADD CONSTRAINT "document_signers_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_signers" ADD CONSTRAINT "document_signers_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Many signatures per document, one per step ───────────────────────────────
-- The unique index on documentId is the thing that made a chain impossible.
-- What replaces it is stricter where it matters: one signature per STEP.
DROP INDEX IF EXISTS "document_signatures_documentId_key";

ALTER TABLE "document_signatures" ADD COLUMN IF NOT EXISTS "signerId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "document_signatures_signerId_key"
  ON "document_signatures" ("signerId");
-- The chain, in order — every read of a sealed document asks for this.
CREATE INDEX IF NOT EXISTS "document_signatures_documentId_signedAt_idx"
  ON "document_signatures" ("documentId", "signedAt");

DO $$ BEGIN
  ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_signerId_fkey"
    FOREIGN KEY ("signerId") REFERENCES "document_signers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
