-- Customer signing by emailed link.
--
-- A client with no login countersigns the last step of a chain. One link per
-- CLIENT rather than per document, because a supplier issuing eleven time
-- sheets at month end would otherwise send eleven emails carrying eleven links
-- to eleven identical signing ceremonies.
--
-- Additive and idempotent throughout. The one widening — DocumentSignature.userId
-- becoming nullable — permits rows that were previously impossible and rejects
-- nothing that exists.

-- ── A signature is by a member OR by a client ───────────────────────────────
-- userId was NOT NULL with a required FK, which quietly meant only somebody
-- with a login could ever sign. Inventing a shadow user for each client would
-- have put a fake member into every roster, seat count and permission check.
ALTER TABLE "document_signatures" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "document_signatures" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
-- What a link signer typed about themselves — the only identity this flow has.
ALTER TABLE "document_signatures" ADD COLUMN IF NOT EXISTS "signerName" TEXT;
ALTER TABLE "document_signatures" ADD COLUMN IF NOT EXISTS "signerRole" TEXT;
-- One ceremony, many documents. Each certificate says which batch it was in:
-- a document signed among eleven is weaker evidence than one signed alone.
ALTER TABLE "document_signatures" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

DO $$ BEGIN
  ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Every signature must be by somebody. Nullable columns alone would allow a row
-- that is neither, which is the one state nothing downstream could render.
DO $$ BEGIN
  ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_signer_present"
    CHECK ("userId" IS NOT NULL OR "customerId" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The register asks "who signed in this sitting"; without it that is a scan.
CREATE INDEX IF NOT EXISTS "document_signatures_batchId_idx"
  ON "document_signatures" ("batchId");

-- ── Did they open it before signing ─────────────────────────────────────────
-- Evidence, not a gate. Requiring ten opens for ten identical time sheets buys
-- clicking-through, which is a worse signature than the honest one.
ALTER TABLE "document_signers" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3);

-- ── The link itself ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "customer_sign_links" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId"     TEXT NOT NULL,
  -- SHA-256 only. The plaintext exists in the email that carried it and nowhere
  -- else: a database dump must not hand somebody a working signing link, which
  -- is exactly what invitation codes do by storing the plaintext beside the hash.
  "tokenHash"      TEXT NOT NULL,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  -- Rate limiting with no new infrastructure: "send me a new link" refuses when
  -- this is recent, so the form cannot be turned into a mail bomb.
  "lastSentAt"     TIMESTAMP(3),
  "sentCount"      INTEGER NOT NULL DEFAULT 0,
  -- Sent is not seen. This is what separates chasing the client from chasing
  -- the mail provider.
  "firstOpenedAt"  TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_sign_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_sign_links_tokenHash_key"
  ON "customer_sign_links" ("tokenHash");

-- One live link per client. Re-issuing REPLACES the hash and so kills the old
-- link: two live links is two people able to sign as the client.
CREATE UNIQUE INDEX IF NOT EXISTS "customer_sign_links_organizationId_customerId_key"
  ON "customer_sign_links" ("organizationId", "customerId");

-- The nightly sweep reads this and nothing else.
CREATE INDEX IF NOT EXISTS "customer_sign_links_expiresAt_idx"
  ON "customer_sign_links" ("expiresAt");

DO $$ BEGIN
  ALTER TABLE "customer_sign_links" ADD CONSTRAINT "customer_sign_links_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_sign_links" ADD CONSTRAINT "customer_sign_links_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
