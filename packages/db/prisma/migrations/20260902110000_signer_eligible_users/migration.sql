-- A step can be open to several people; the first to sign completes it.
--
-- Until now a step held exactly one signer, chosen at issue. That is fine when
-- one person is responsible and wrong when a shift has a space manager and two
-- shift leaders who can each countersign: naming one of them means the document
-- waits on whoever happens to be on holiday.
--
-- The step still has ONE row — the chain cannot fork — but it now carries the
-- set of people who may sign it. `userId` stops meaning "who must sign" and
-- starts meaning "who did", which is why it is already nullable.

ALTER TABLE "document_signers"
  ADD COLUMN IF NOT EXISTS "eligibleUserIds" TEXT[] NOT NULL DEFAULT '{}';

-- Existing steps keep their behaviour exactly: the person named on them is the
-- only one eligible, so nothing that is currently waiting changes hands.
UPDATE "document_signers"
   SET "eligibleUserIds" = ARRAY["userId"]
 WHERE "userId" IS NOT NULL
   AND cardinality("eligibleUserIds") = 0;

-- "What is waiting for me" is asked against this on every member's screen.
CREATE INDEX IF NOT EXISTS "document_signers_eligible_idx"
  ON "document_signers" USING GIN ("eligibleUserIds");
