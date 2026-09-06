-- Keep today's behaviour for people who already work away from a site.
--
-- The previous migration defaulted every workspace to STRICT, which is the right
-- default for a workspace nobody has thought about. But it is the WRONG outcome
-- for an organization that already has remote workers: before this feature they
-- pressed "Clock in remotely" and it worked, and after it the button would have
-- disappeared — because it now asks whether any of their workspaces permits an
-- away day, and on the morning of the deploy none of them does.
--
-- A member's grant (`users.allowRemote`) is what let them work away yesterday.
-- So every workspace they are actively assigned to is opened to away days, and
-- the effective set of (person, workspace) pairs that may do it is exactly the
-- set that could do it before: the grant is still per person, and a colleague
-- without one is still refused at the same workspace.
--
-- Deliberately narrow. It opens only workspaces that a granted member is
-- assigned to RIGHT NOW — not every workspace in an organization that happens to
-- employ one remote worker.
--
-- Hand-authored and idempotent: it only ever widens STRICT, so re-running it
-- changes nothing, and a workspace an admin has since set back to STRICT stays
-- that way (this runs once, at the migration).

UPDATE "company_locations" cl
SET "geofencePolicy" = 'AWAY_ALLOWED'
WHERE cl."geofencePolicy" = 'STRICT'
  AND EXISTS (
    SELECT 1
    FROM "space_assignments" sa
    JOIN "users" u ON u.id = sa."userId"
    WHERE sa."spaceId" = cl.id
      AND u."allowRemote" = true
      AND u."isActive" = true
      AND sa."effectiveFrom" <= now()
      AND (sa."effectiveTo" IS NULL OR sa."effectiveTo" >= now())
  );
