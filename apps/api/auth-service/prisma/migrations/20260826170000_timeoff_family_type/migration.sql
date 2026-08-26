-- "Personal" was a category nobody says out loud. The real reason people take
-- an unplanned day is a family one — a sick child, an elderly parent, someone
-- at home who needs them — so the type now names that.
--
-- RENAME rather than add-and-migrate: the value keeps its rows, so nothing has
-- to be re-classified and no request loses its kind in transit.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TimeOffType' AND e.enumlabel = 'PERSONAL'
  ) THEN
    ALTER TYPE "TimeOffType" RENAME VALUE 'PERSONAL' TO 'FAMILY';
  END IF;
END $$;

-- Catch the family wording the first backfill did not look for. It only knew
-- the word "personal", so a request that said "childcare" or "Familie" was
-- left as VACATION and would have been deducted from someone's allowance.
UPDATE "time_off_requests" SET "type" = 'FAMILY'
  WHERE "type" = 'VACATION'
    AND "reason" ~* '(family|famil|kind|child|childcare|kinderbetreuung|garde d''enfant)';
