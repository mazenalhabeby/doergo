-- Two corrections to the migrations above, deliberately in a file of their own.
--
-- Both were found by reading the batch again before deploying it and by diffing
-- the schema against the database the batch actually builds. Neither is fixed by
-- editing the earlier files: those have been applied to a database already, and
-- an applied migration that changes underneath you is a checksum mismatch at
-- best and two different histories at worst.

-- ── 1. Unpaid break minutes, recomputed FROM THE ROWS ──────────────────────
--
-- `20260906180000_break_rules` backfills them as
--   SET "unpaidBreakMinutes" = "breakMinutes" WHERE "unpaidBreakMinutes" = 0 …
-- which is right exactly once. Every break that exists at migration time is
-- unpaid, so the answer is correct on the first run. But the moment somebody
-- takes a PAID rest, that entry legitimately has unpaid = 0 and break = 30 — and
-- a re-run would silently make their paid rest unpaid. The file claims to
-- survive a re-run, and that statement does not.
--
-- Summing the rows is also the discipline the break service itself follows:
-- recomputed from what is there, never incremented, so it cannot drift. Running
-- this immediately after the original is a no-op on a fresh database and a
-- correction on any database where it has already been run twice.
UPDATE "time_entries" te
SET "unpaidBreakMinutes" = COALESCE((
  SELECT SUM(b."durationMinutes")
  FROM "breaks" b
  WHERE b."timeEntryId" = te.id
    AND b."endedAt" IS NOT NULL
    AND b."isPaid" = false
), 0)
WHERE COALESCE(te."breakMinutes", 0) > 0;

-- ── 2. The index the overtime change left behind ───────────────────────────
--
-- `20260906200000_overtime_rounds` created [timeEntryId, cycle] and dropped the
-- UNIQUE on timeEntryId, but the plain [timeEntryId] index from before it stayed
-- in the database while the schema stopped declaring it. `prisma migrate diff`
-- reported it as drift, which is how it was found.
--
-- Safe to drop: the new composite index serves every lookup the old one did, by
-- leftmost prefix. Left alone it would cost a little on every write and make the
-- next person's drift check noisier than it should be.
DROP INDEX IF EXISTS "overtime_requests_timeEntryId_idx";
