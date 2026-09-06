-- Overtime is a loop, so its record has to be able to repeat.
--
-- `timeEntryId` was UNIQUE, which gave a shift exactly one overtime record ever.
-- The flow itself already loops — approve minutes, the expected end moves, the
-- reminder re-arms, the member is asked again — so every round after the first
-- ran with nowhere to be written down.
--
-- Hand-authored and idempotent; the shadow database on this project is broken.

ALTER TABLE "overtime_requests"
  ADD COLUMN IF NOT EXISTS "cycle" INTEGER NOT NULL DEFAULT 1;

-- Dropping the unique constraint WIDENS what is legal, so nothing that exists
-- becomes invalid. Named two ways because Prisma has emitted both spellings for
-- a @unique field over this schema's life.
ALTER TABLE "overtime_requests" DROP CONSTRAINT IF EXISTS "overtime_requests_timeEntryId_key";
DROP INDEX IF EXISTS "overtime_requests_timeEntryId_key";

CREATE INDEX IF NOT EXISTS "overtime_requests_timeEntryId_cycle_idx"
  ON "overtime_requests"("timeEntryId", "cycle");
