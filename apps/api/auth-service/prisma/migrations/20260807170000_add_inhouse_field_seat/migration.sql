-- In-house field seat pricing (backlog #8).
-- Field (mobile-only) technicians split into external (€15) and in-house (€9).

-- Employment relationship on each member; drives their field seat price.
-- Default EXTERNAL preserves today's billing (all field seats are €15) until an
-- admin marks someone in-house.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employmentType" TEXT DEFAULT 'EXTERNAL';

-- In-house field seat quantity on the subscription (mirrors officeSeats/fieldSeats).
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "fieldInhouseSeats" INTEGER NOT NULL DEFAULT 0;
