-- Match keys for the contacts import's duplicate check. Additive.
--
-- The SAME rules as `phoneMatchKey` / `emailMatchKey` in packages/shared
-- (crm/contact-keys.ts): the last 9 digits of a phone with at least 7, and the
-- trimmed lower-cased email when it has something either side of an "@".
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phoneKey" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "emailKey" TEXT;

UPDATE "customers"
SET "phoneKey" = CASE
      WHEN length(regexp_replace(coalesce("phone", ''), '\D', '', 'g')) >= 7
      THEN right(regexp_replace("phone", '\D', '', 'g'), 9)
      ELSE NULL
    END,
    "emailKey" = CASE
      WHEN position('@' IN btrim(coalesce("email", ''))) > 1
       AND position('@' IN btrim("email")) < length(btrim("email"))
       AND length(btrim("email")) <= 254
      THEN lower(btrim("email"))
      ELSE NULL
    END
WHERE "phone" IS NOT NULL OR "email" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "customers_organizationId_phoneKey_idx" ON "customers"("organizationId", "phoneKey");
CREATE INDEX IF NOT EXISTS "customers_organizationId_emailKey_idx" ON "customers"("organizationId", "emailKey");
