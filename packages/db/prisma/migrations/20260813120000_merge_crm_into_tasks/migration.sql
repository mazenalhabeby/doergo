-- Merge Sales/CRM into the Space + Task core.
--  * A DEAL is now a Task (of the "Deal" task type); pipeline stages = the task
--    workflow statuses. Add native deal fields to tasks + a `probability` to
--    workflow_statuses (weighted forecast).
--  * Retire the standalone CRM entities (pipelines, deals, leads, activities,
--    quotes). These tables were just deployed and are empty. Contacts +
--    commissions stay (the only things Tasks don't provide).
-- Additive columns + drops; idempotent.

-- ── Native deal fields on tasks ──────────────────────────────────────────────
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "amountCents" INTEGER;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "currency" TEXT;

-- ── Pipeline stage probability on workflow statuses ──────────────────────────
ALTER TABLE "workflow_statuses" ADD COLUMN IF NOT EXISTS "probability" INTEGER;

-- ── commission_entries: quoteId removed from the model ───────────────────────
ALTER TABLE "commission_entries" DROP COLUMN IF EXISTS "quoteId";

-- ── Drop the retired standalone CRM tables (FK-safe via CASCADE) ─────────────
DROP TABLE IF EXISTS "sales_activities" CASCADE;
DROP TABLE IF EXISTS "quotes" CASCADE;
DROP TABLE IF EXISTS "deals" CASCADE;
DROP TABLE IF EXISTS "pipeline_stages" CASCADE;
DROP TABLE IF EXISTS "pipelines" CASCADE;
DROP TABLE IF EXISTS "leads" CASCADE;

-- ── Drop the now-unused enums ────────────────────────────────────────────────
DROP TYPE IF EXISTS "LeadStatus";
DROP TYPE IF EXISTS "SalesActivityType";
DROP TYPE IF EXISTS "QuoteStatus";
