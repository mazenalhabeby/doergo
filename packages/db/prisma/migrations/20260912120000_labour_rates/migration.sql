-- Two rates, four levels — and every one of them optional.
--
-- What an hour is BILLED at and what it COSTS are different questions, and some
-- companies only ever ask the first. A plumber charges €85 and that is the whole
-- story; a staffing agency pays €20 and bills €40, and the gap is the business.
--
-- ⚠️ EVERY COLUMN IS NULLABLE WITH NO DEFAULT, deliberately. NULL means
-- "inherit from the level above"; 0 is a real rate of nothing. A DEFAULT 0 here
-- would turn every existing member into somebody who bills nothing, and the
-- resolver could never tell that from a deliberate free-of-charge rate.
--
-- Nothing is backfilled for the same reason: an organization with no cost rate
-- anywhere is a ONE-rate business, and that is exactly how it should read.
--
-- Additive and idempotent, like every migration here — the shadow database is
-- broken in this repo, so these are hand-authored and must be safe to re-run
-- against a production schema that has drifted.

-- The person: usually where COST lives.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billRateCents" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "costRateCents" INTEGER;

-- The customer workspace: usually where the BILL lives. `billableRateCents`
-- already exists and is that rate; this is only its cost sibling.
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "costRateCents" INTEGER;

-- The organization fallback, same shape.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "costRateCents" INTEGER;

-- The top rung: this member, at this client. Blank on almost every assignment,
-- because it exists for the exception and not the rule.
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "billRateCents" INTEGER;
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "costRateCents" INTEGER;

-- The snapshot. NOT a cache of the ladder — the record of it. The ladder says
-- what a rate is now; a paid invoice has to keep saying what it was then, or a
-- raise in June moves an invoice from March.
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "billRateCents" INTEGER;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "costRateCents" INTEGER;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "billedHours" DOUBLE PRECISION;
