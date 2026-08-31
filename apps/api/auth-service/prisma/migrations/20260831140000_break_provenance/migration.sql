-- Where a break came from.
--
-- Breaks have only ever been self-service: the member starts and ends them on
-- their phone, and the row says nothing about who created it because there was
-- only ever one answer. Letting somebody else add one on the member's behalf
-- changes that, and a break added by an administrator that looks identical to
-- one the member took is a record that quietly misrepresents the day.
--
-- NULL means the member recorded it themselves — which is every existing row,
-- correctly, and remains the normal case.
ALTER TABLE "breaks" ADD COLUMN IF NOT EXISTS "addedById" TEXT;

-- Why. Required by the service for a break somebody else adds: an entry that
-- changes paid hours without a reason is an argument waiting to happen.
ALTER TABLE "breaks" ADD COLUMN IF NOT EXISTS "reason" TEXT;

DO $$ BEGIN
  ALTER TABLE "breaks"
    ADD CONSTRAINT "breaks_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- For "what has this person been adding to other people's timesheets", which is
-- the question an audit asks. Partial: the column is NULL for almost every row.
CREATE INDEX IF NOT EXISTS "breaks_addedById_idx" ON "breaks"("addedById") WHERE "addedById" IS NOT NULL;
