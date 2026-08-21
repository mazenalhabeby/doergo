-- Organizations billed by agreement rather than through Stripe.
--
-- Without this there is no state meaning "we do not charge these people". The
-- old marker was planTier = ENTERPRISE, which is gone, and its absence is a
-- live hazard: the moment a card is attached to one of these organizations,
-- reconcile would compute the bill and start charging it. That is exactly the
-- accident this flag exists to make impossible.
--
-- The bill is still computed and displayed for them — it is what a contract
-- conversation is about — but labelled as an estimate, not a charge.
--
-- Idempotent: safe to re-run.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "billedExternally" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every organization that was on the ENTERPRISE tier was, by
-- definition, on a negotiated contract rather than self-serve checkout. None of
-- them has a Stripe customer, so none is being charged today; this records that
-- as a deliberate state instead of an accident of them never checking out.
UPDATE "organizations"
SET "billedExternally" = true
WHERE "planTier" = 'ENTERPRISE';
