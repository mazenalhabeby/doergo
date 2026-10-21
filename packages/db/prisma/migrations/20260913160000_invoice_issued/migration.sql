-- ISSUED: final and numbered, not yet delivered.
--
-- Additive and unused by any existing row, so nothing changes meaning. A draft
-- stays a draft; a sent invoice stays sent.
--
-- ⚠️ `ADD VALUE` may not be USED in the transaction that adds it (Postgres).
-- This migration only declares it, which is why nothing else belongs in here.
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'ISSUED' AFTER 'DRAFT';
