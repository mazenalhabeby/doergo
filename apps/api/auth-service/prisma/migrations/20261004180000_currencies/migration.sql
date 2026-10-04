-- A currency for the organization, each workspace and each client; an invoice
-- keeps its exchange rate. Additive: nothing changes until somebody sets one.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE "company_locations" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "exchangeRateSource" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "exchangeRateDate" DATE;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "baseCurrency" TEXT;
