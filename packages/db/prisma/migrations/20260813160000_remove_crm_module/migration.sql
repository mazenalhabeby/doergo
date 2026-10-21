-- Remove the Sales/CRM module entirely. Sales/delivery is just a Space + normal
-- Tasks on a GPS-capable workflow; there is no bespoke CRM. Deal value, if ever
-- needed, is a custom field. The multi-stop route optimizer stays (stateless,
-- mobile-only) — no schema. Drop the sales-only tables, columns and enums.
-- All were empty. Idempotent.

DROP TABLE IF EXISTS "commission_entries" CASCADE;
DROP TABLE IF EXISTS "commission_rules" CASCADE;
DROP TABLE IF EXISTS "contacts" CASCADE;

ALTER TABLE "tasks" DROP COLUMN IF EXISTS "amountCents";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "currency";
ALTER TABLE "workflow_statuses" DROP COLUMN IF EXISTS "probability";

DROP TYPE IF EXISTS "CommissionEntryStatus";
DROP TYPE IF EXISTS "CommissionBasis";
