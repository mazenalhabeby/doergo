-- Attendance label rules (docs/plans/clock-attendance-2026-10.md). Additive only: no row is
-- rewritten. Entries keep labelRules NULL and today's behaviour; only new entries get stamped.
ALTER TABLE "time_entries" ADD COLUMN "labelRules" INTEGER;
ALTER TABLE "time_entries" ADD COLUMN "labelFacts" JSONB;
ALTER TABLE "company_locations" ADD COLUMN "boundaryChangedAt" TIMESTAMP(3);
