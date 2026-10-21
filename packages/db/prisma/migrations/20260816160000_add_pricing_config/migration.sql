-- Editable versioned price book (C2). No Stripe mutation.
CREATE TABLE IF NOT EXISTS "pricing_configs" (
  "id" TEXT NOT NULL, "version" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'eur',
  "active" BOOLEAN NOT NULL DEFAULT false, "note" TEXT, "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_configs_version_key" ON "pricing_configs"("version");
CREATE TABLE IF NOT EXISTS "seat_prices" (
  "id" TEXT NOT NULL, "configId" TEXT NOT NULL, "seatType" TEXT NOT NULL, "tier" TEXT,
  "monthlyCents" INTEGER NOT NULL, "annualCents" INTEGER NOT NULL, "stripePriceId" TEXT,
  CONSTRAINT "seat_prices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "seat_prices_configId_idx" ON "seat_prices"("configId");
CREATE TABLE IF NOT EXISTS "module_prices" (
  "id" TEXT NOT NULL, "configId" TEXT NOT NULL, "moduleKey" TEXT NOT NULL,
  "monthlyCents" INTEGER NOT NULL, "annualCents" INTEGER NOT NULL,
  "billingScope" TEXT NOT NULL DEFAULT 'per_org', "stripePriceId" TEXT,
  CONSTRAINT "module_prices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "module_prices_configId_idx" ON "module_prices"("configId");
DO $$ BEGIN
  ALTER TABLE "seat_prices" ADD CONSTRAINT "seat_prices_configId_fkey" FOREIGN KEY ("configId") REFERENCES "pricing_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "module_prices" ADD CONSTRAINT "module_prices_configId_fkey" FOREIGN KEY ("configId") REFERENCES "pricing_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
