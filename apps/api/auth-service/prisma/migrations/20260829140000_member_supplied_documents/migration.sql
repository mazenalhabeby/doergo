-- Member-supplied documents, and the review they wait in.
--
-- Only an administrator could file anything: `presignUpload` required
-- `canIssueDocuments`, so a driving licence — a document only its holder
-- possesses — had to be emailed to the office and uploaded by somebody else.
-- That does not scale past a handful of people and the data is stale within a
-- month of the last chase.
--
-- Two new statuses carry the whole model:
--
--   PENDING_VERIFICATION  the member uploaded it; nobody has looked yet
--   REJECTED              a reviewer looked and refused it, with a reason
--
-- Both are SAFE BY CONSTRUCTION against the dispatch gate, which selects
-- `status IN ('ISSUED','SIGNED')`. An unverified self-upload therefore cannot
-- satisfy a credential requirement without a human moving it to ISSUED — the
-- gate needed no change at all, which is the point of putting the state here
-- rather than in a boolean beside it.
--
-- Purely additive: two enum values on each of two enums, one nullable column.
-- PostgreSQL 16 permits ADD VALUE inside a transaction as long as the new value
-- is not USED in the same one; nothing below uses them.

ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';
ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TYPE "DocumentEventType" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "DocumentEventType" ADD VALUE IF NOT EXISTS 'REJECTED';

-- Why it was refused, in the reviewer's words. On the row rather than only in
-- the event trail because the member's own list has to show it: "rejected" with
-- no reason is an instruction to upload the same photo again.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
