-- Additive: at most ONE "Remote" bucket per organization. Two first remote clock-ins at once each created one
-- (clock-in-context.service `getOrCreateRemoteBucket` now catches the refusal and reads the winner's).
-- ⚠️ A partial index Prisma's schema cannot express — a `migrate diff` lists it as drift; keep it.
-- ⚠️ Created only when no organization already holds two buckets: merging them means moving time entries, which
-- is a decision, not a migration. The NOTICE names that case; re-run this statement once they are merged.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "company_locations" WHERE "isRemote" GROUP BY "organizationId" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'company_locations_one_remote_bucket NOT created: an organization has more than one Remote bucket';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "company_locations_one_remote_bucket"
      ON "company_locations"("organizationId") WHERE "isRemote";
  END IF;
END $$;
