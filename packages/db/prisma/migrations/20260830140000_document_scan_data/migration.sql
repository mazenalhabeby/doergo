-- What was READ off the document, and whether it held up.
--
-- A member photographing a licence gave us an image and a date they typed. The
-- date was the weakest part of the whole chain: nothing checked it against the
-- document, so a mistyped year sat in the compliance board as fact and an
-- invented one was indistinguishable from a real one.
--
-- Scanning changes what can be known. The machine-readable zone carries the
-- expiry, the document number, the holder's name and date of birth, each with a
-- check digit — so the expiry becomes something read rather than something
-- claimed, and the name becomes something to compare against the member we hold.
--
-- The extracted fields are columns, not only JSON, because they are queried:
-- the document number for "has somebody else already filed this exact
-- document", the holder name for the mismatch check. The full read and every
-- check result stay as JSON beside them, so a reviewer can see what the machine
-- saw without this table growing a column per format.

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "scanFormat"     TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "scanVerdict"    TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "scanData"       JSONB;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "scanChecks"     JSONB;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "holderName"     TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "documentNumber" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "dateOfBirth"    DATE;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "issuingState"   TEXT;

-- "Has this exact document already been filed, by anyone here?" The same licence
-- number under two names is the one duplicate worth catching, and it is a
-- lookup that has to stay cheap on every submission.
CREATE INDEX IF NOT EXISTS "documents_org_document_number_idx"
  ON "documents" ("organizationId", "documentNumber");
