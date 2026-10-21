-- Prevent duplicate invoice numbers within an organization. The app generates
-- numbers with a read-then-write sequence, so concurrent creates could otherwise
-- collide; this unique index is the backstop (the service retries on violation).
-- Idempotent so it is safe against prod schema drift.
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_organizationId_invoiceNumber_key"
  ON "invoices" ("organizationId", "invoiceNumber");

-- The standalone invoiceNumber index is now redundant (covered by the composite).
DROP INDEX IF EXISTS "invoices_invoiceNumber_idx";
