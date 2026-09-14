-- Offline sync foundations.
--
-- 1. A phone pulls "what changed since my cursor". Changes are found by
--    updatedAt; attachments had none.
-- 2. DELETIONS leave no row to find, so a deleted task would live on every
--    phone forever. A trigger records each delete as a tombstone.
--
--    ⚠️ Triggers, not application code: a task delete CASCADES to its comments,
--    attachments and assignees inside Postgres, where no service ever sees
--    them. A trigger fires for those too.
--
-- Additive and idempotent.

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "report_attachments" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Pull by organization in change order.
CREATE INDEX IF NOT EXISTS "tasks_organizationId_updatedAt_idx" ON "tasks" ("organizationId", "updatedAt");
CREATE INDEX IF NOT EXISTS "time_entries_userId_updatedAt_idx" ON "time_entries" ("userId", "updatedAt");

CREATE TABLE IF NOT EXISTS "sync_tombstones" (
    "id"             BIGSERIAL PRIMARY KEY,
    "entity"         TEXT NOT NULL,           -- the table the row was deleted from
    "entityId"       TEXT NOT NULL,
    "organizationId" TEXT,                    -- when the row carried one
    "parentId"       TEXT,                    -- taskId / timeEntryId / reportId / … when it had one
    "userId"         TEXT,                    -- when the row belonged to a member
    "deletedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "sync_tombstones_org_deletedAt_idx" ON "sync_tombstones" ("organizationId", "deletedAt");
CREATE INDEX IF NOT EXISTS "sync_tombstones_parent_deletedAt_idx" ON "sync_tombstones" ("parentId", "deletedAt");
CREATE INDEX IF NOT EXISTS "sync_tombstones_user_deletedAt_idx" ON "sync_tombstones" ("userId", "deletedAt");
CREATE INDEX IF NOT EXISTS "sync_tombstones_deletedAt_idx" ON "sync_tombstones" ("deletedAt");

-- One generic function for every synced table: reads the columns by name from
-- the deleted row, so a table without organizationId simply records NULL.
CREATE OR REPLACE FUNCTION sync_record_tombstone() RETURNS trigger AS $$
DECLARE
  r jsonb := to_jsonb(OLD);
BEGIN
  INSERT INTO "sync_tombstones" ("entity", "entityId", "organizationId", "parentId", "userId")
  VALUES (
    TG_TABLE_NAME,
    r->>'id',
    r->>'organizationId',
    COALESCE(r->>'taskId', r->>'timeEntryId', r->>'reportId', r->>'noteId', r->>'conversationId', r->>'issueId'),
    r->>'userId'
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tasks', 'comments', 'attachments', 'task_assignees',
    'service_reports', 'report_attachments',
    'company_locations', 'space_assignments',
    'time_entries', 'breaks', 'time_entry_notes', 'time_entry_note_attachments', 'shift_instances'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS sync_tombstone ON %I', t);
    EXECUTE format('CREATE TRIGGER sync_tombstone AFTER DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone()', t);
  END LOOP;
END $$;
