-- Whether an invoice shows the HOURS / DAYS tag before each labour line. Additive.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "showLineTags" BOOLEAN NOT NULL DEFAULT true;
