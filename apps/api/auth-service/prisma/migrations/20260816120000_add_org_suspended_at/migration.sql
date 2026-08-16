-- Platform-operator hard lock (forces read-only via SubscriptionGuard; Stripe untouched).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
