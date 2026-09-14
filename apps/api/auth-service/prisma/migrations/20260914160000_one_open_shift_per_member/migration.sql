-- One open shift per member, enforced by the database.
--
-- A clock-in recorded offline and replayed late, racing a clock-in from the web,
-- could otherwise open two shifts for one person: both requests read "not
-- clocked in" before either wrote. The service checks first and maps this
-- constraint to ALREADY_CLOCKED_IN; the index is what makes the check true.
--
-- ⚠️ Partial, so closed shifts are unaffected. Created only when no member
-- already has two open shifts — a duplicate is a data problem for a person to
-- resolve, and a migration that fails would stop every service from starting.
-- Prisma cannot express a partial index, so it is not in schema.prisma.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "time_entries" WHERE "status" = 'CLOCKED_IN' GROUP BY "userId" HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'time_entries_one_open_per_user NOT created: a member has more than one open shift';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_one_open_per_user"
      ON "time_entries" ("userId") WHERE "status" = 'CLOCKED_IN';
  END IF;
END $$;
