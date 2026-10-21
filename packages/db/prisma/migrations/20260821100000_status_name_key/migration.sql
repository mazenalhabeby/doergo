-- A translation key for steps that came from a shipped template.
--
-- Status names are tenant data — someone typed them — so they cannot live in a
-- locale file. But most are not typed: they arrive from the library in English,
-- and a German organisation then reads "On The Way" forever, in an app that is
-- otherwise fully translated.
--
-- A step copied from a SHIPPED template carries the key its name came from; the
-- client renders the translation and falls back to the stored name. No join, no
-- per-locale table, no extra query — the lookup is a hash hit in a bundle the
-- client already has. A step someone wrote has no key and renders what they
-- wrote, which is the only correct answer for a name typed in German.
--
-- Backfilled below for the statuses whose key matches a shipped step. Matching
-- on `key`, not on `name`: the key is the identifier and survives a rename,
-- and a tenant who renamed a step should keep their name.
ALTER TABLE "workflow_statuses" ADD COLUMN IF NOT EXISTS "nameKey" TEXT;

UPDATE "workflow_statuses"
SET "nameKey" = 'workflowStatus.' || lower(key)
WHERE "nameKey" IS NULL
  AND key IN (
    'ASSIGNED','ACCEPTED','EN_ROUTE','ARRIVED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELED',
    'PICKED_UP','IN_TRANSIT','DELIVERED','TODO','DOING','DONE','SCHEDULED','VISITED','OUTCOME',
    'SUBMITTED','NEW','OPEN','TRIAGING','WAITING','RESOLVED','CLOSED','WORKING','PENDING','REVIEW','TESTING','BACKLOG'
  );
