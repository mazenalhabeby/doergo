-- Session work-log: timestamped notes + S3-backed attachments during a clock-in session.

CREATE TABLE IF NOT EXISTS "time_entry_notes" (
  "id"             TEXT NOT NULL,
  "timeEntryId"    TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "taskId"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "time_entry_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "time_entry_notes_timeEntryId_at_idx" ON "time_entry_notes" ("timeEntryId", "at");
CREATE INDEX IF NOT EXISTS "time_entry_notes_organizationId_idx" ON "time_entry_notes" ("organizationId");

CREATE TABLE IF NOT EXISTS "time_entry_note_attachments" (
  "id"             TEXT NOT NULL,
  "noteId"         TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "fileKey"        TEXT NOT NULL,
  "fileUrl"        TEXT NOT NULL,
  "fileName"       TEXT NOT NULL,
  "fileSize"       INTEGER NOT NULL,
  "mimeType"       TEXT NOT NULL,
  "width"          INTEGER,
  "height"         INTEGER,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "time_entry_note_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "time_entry_note_attachments_noteId_idx" ON "time_entry_note_attachments" ("noteId");

DO $$ BEGIN
  ALTER TABLE "time_entry_notes"
    ADD CONSTRAINT "time_entry_notes_timeEntryId_fkey"
    FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "time_entry_note_attachments"
    ADD CONSTRAINT "time_entry_note_attachments_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "time_entry_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
