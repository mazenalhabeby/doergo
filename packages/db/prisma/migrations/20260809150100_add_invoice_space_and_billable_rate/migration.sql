-- Customer invoicing: billable rate (org default + per-space override) and
-- link invoices to a CUSTOMER-kind space. Additive/idempotent.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billableRateCents" INTEGER;
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "billableRateCents" INTEGER;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "spaceId" TEXT;

CREATE INDEX IF NOT EXISTS "invoices_organizationId_spaceId_idx" ON "invoices"("organizationId", "spaceId");
