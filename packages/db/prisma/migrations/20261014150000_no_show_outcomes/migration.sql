-- How a no-show ENDED (additive). State ABSENT is new and needs no DDL (state is text).
ALTER TABLE "shift_instances" ADD COLUMN "closeReason" TEXT;
ALTER TABLE "shift_instances" ADD COLUMN "closedAutomatically" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shift_instances" ADD COLUMN "decidedAt" TIMESTAMP(3);
ALTER TABLE "shift_instances" ADD COLUMN "settledSpaceId" TEXT;

-- What was already excused: by the sweep (nobody named) = approved leave; by a leader = their own words.
UPDATE "shift_instances" SET "closeReason" = 'LEAVE', "closedAutomatically" = true
  WHERE "state" = 'EXCUSED' AND "excusedById" IS NULL;
UPDATE "shift_instances" SET "closeReason" = 'OTHER', "decidedAt" = "updatedAt"
  WHERE "state" = 'EXCUSED' AND "excusedById" IS NOT NULL;
