-- The staffing floor for a workspace: how many people must be on the floor on a
-- working day, so approving leave can be judged against a rule rather than
-- against the approver's memory.
--
-- 0 is the default and means NOT SET, not "nobody needed". Every surface reads
-- it that way: with no floor the screens still show the headcount and simply
-- pass no verdict on it. That is what makes this migration a no-op for every
-- existing organization on the day it deploys.
--
-- Additive and idempotent; the shadow database is broken here, so migrations are
-- hand-authored and must be safe to re-run.
ALTER TABLE "company_locations"
  ADD COLUMN IF NOT EXISTS "minCover" INTEGER NOT NULL DEFAULT 0;
