-- Sprints, phases and epics belong to a space.
--
-- They were organization-owned, which meant the module that governs them was
-- the organization's too — the one remaining place a mutation could not be
-- judged against the space it actually happens in.
--
-- NULL means organization-wide: how they have always worked, what every existing
-- row keeps, and a real answer for an organization running one backlog across
-- its sites. Required would have forced every existing row into an arbitrary
-- space.
--
-- ON DELETE SET NULL, not CASCADE: deleting a space must not silently delete a
-- sprint's worth of planning. It falls back to organization-wide.
--
-- Idempotent: the shadow database is unusable here, so migrations are
-- hand-authored and must tolerate re-application.

ALTER TABLE "sprints" ADD COLUMN IF NOT EXISTS "spaceId" TEXT;
ALTER TABLE "phases"  ADD COLUMN IF NOT EXISTS "spaceId" TEXT;
ALTER TABLE "epics"   ADD COLUMN IF NOT EXISTS "spaceId" TEXT;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sprints', 'phases', 'epics'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_spaceId_fkey') THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("spaceId") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE',
        t, t || '_spaceId_fkey'
      );
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("spaceId")', t || '_spaceId_idx', t);
  END LOOP;
END $$;
