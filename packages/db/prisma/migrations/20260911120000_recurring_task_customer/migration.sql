-- A repeating task remembers which client it repeats FOR.
--
-- A one-off visit has carried `customerId` since client visits shipped; the
-- recurring template silently did not, so the commonest visit of all — the
-- monthly service call — generated tasks with the right address and no client
-- on them. "What have we done for this client" answered with one-offs only,
-- and nothing on screen suggested anything was missing.
--
-- Additive and idempotent, like every migration in this repo: the shadow
-- database is broken here, so these are hand-authored and must be safe to
-- re-run against a production schema that has drifted.
ALTER TABLE "recurring_task_templates"
  ADD COLUMN IF NOT EXISTS "customerId" TEXT;

-- SET NULL, not CASCADE. Deleting a client must not silently delete the
-- schedule that generates work — the visits stop, which is a decision somebody
-- should make deliberately, not a side effect they discover next month.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recurring_task_templates_customerId_fkey'
  ) THEN
    ALTER TABLE "recurring_task_templates"
      ADD CONSTRAINT "recurring_task_templates_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "recurring_task_templates_customerId_idx"
  ON "recurring_task_templates"("customerId");
