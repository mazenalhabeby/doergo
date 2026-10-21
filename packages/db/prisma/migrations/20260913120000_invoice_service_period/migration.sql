-- The days an invoice covers.
--
-- Additive and nullable: every existing invoice keeps meaning exactly what it
-- meant, and NULL is a real answer ("everything outstanding"), not a gap to be
-- backfilled. Nothing is derived from the lines — see the schema comment.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "servicePeriodFrom" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "servicePeriodTo" TIMESTAMP(3);
