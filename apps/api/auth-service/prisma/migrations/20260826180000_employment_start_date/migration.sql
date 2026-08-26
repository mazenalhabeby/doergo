-- The date someone actually started working here, for pro-rating their first
-- year's vacation.
--
-- Separate from createdAt on purpose. createdAt is when the ACCOUNT was made:
-- an organization importing existing staff creates fifty accounts on one
-- afternoon, and pro-rating from that would cut months off fifty people's
-- allowance for a start date none of them had. Nullable, and pro-rating only
-- happens when it is set — an entitlement is never reduced on a guess.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employmentStartDate" DATE;
