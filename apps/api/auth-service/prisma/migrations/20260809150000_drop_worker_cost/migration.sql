-- Retire the worker labor-cost feature (internal costing). Guarded/idempotent.
ALTER TABLE "users" DROP COLUMN IF EXISTS "costType";
ALTER TABLE "users" DROP COLUMN IF EXISTS "costRateCents";
