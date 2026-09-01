-- A signer can return a document to an earlier step instead of cancelling it.
--
-- Distinct from REJECTED, which ends a supplied document. SENT_BACK keeps the
-- chain alive: the earlier step goes pending again, the trail records why, and
-- one document carries the whole history rather than the first attempt
-- disappearing behind a re-issue.
DO $$ BEGIN
  ALTER TYPE "DocumentEventType" ADD VALUE IF NOT EXISTS 'SENT_BACK';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
