-- Worker labor cost (internal costing → monthly cost view + future invoicing).
-- costType HOURLY → costRateCents is €/hour; FIXED → €/month. null = not costed.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "costType" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "costRateCents" INTEGER;
