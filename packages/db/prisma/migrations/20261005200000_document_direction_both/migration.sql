-- A document type either side may file: the office issues it, or the member uploads it.
-- Additive: existing types keep ISSUED / SUPPLIED.
ALTER TYPE "DocumentDirection" ADD VALUE IF NOT EXISTS 'BOTH';
