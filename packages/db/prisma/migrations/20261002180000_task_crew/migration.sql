-- A crew on one job: each person's own presence, their own stop, and the lead.
--
-- Credit used to start only at a person's own step move, so in a crew where
-- one person taps everybody else counted nothing; three people tapping "On the
-- way" together credited the first; and one person's issue turned the whole
-- crew's working time into blocked time. packages/shared/src/tasks/crew.ts
--
-- Additive: no event is rewritten, no job changes leader, crew mode is off.
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'CREW_JOINED';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'CREW_LEFT';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'SELF_BLOCKED';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'SELF_RESUMED';
ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS 'LEAD_CHANGED';

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "leadOverrideId" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "leadOverrideUntil" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "leadNoticeOn" TEXT;

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "crewMode" BOOLEAN NOT NULL DEFAULT false;
