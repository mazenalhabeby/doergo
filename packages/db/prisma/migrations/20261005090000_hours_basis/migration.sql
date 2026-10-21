-- Which hours of a person's day go on a client invoice: counted (today's rule),
-- clocked, or the planned shift. Additive: null means COUNTED, so nothing moves.
DO $$ BEGIN CREATE TYPE "HoursBasis" AS ENUM ('COUNTED', 'CLOCKED', 'SHIFT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "space_assignments" ADD COLUMN IF NOT EXISTS "hoursBasis" "HoursBasis";
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "hoursBasis" "HoursBasis";
