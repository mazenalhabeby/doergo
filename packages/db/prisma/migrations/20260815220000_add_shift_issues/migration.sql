-- Shift Issues (blockers): a member reports a problem during a shift; the
-- responsible person is notified and it plays out on one live thread.
-- Additive + idempotent (shadow DB is broken → hand-authored, guarded DDL).

DO $$ BEGIN
  CREATE TYPE "ShiftIssueStatus" AS ENUM ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED','CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ShiftIssueSeverity" AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ShiftIssueEventType" AS ENUM ('CREATED','MESSAGE','ACKNOWLEDGED','ASSIGNED','STATUS_CHANGED','RESOLVED','REOPENED','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shift_issues" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "timeEntryId"      TEXT,
  "spaceId"          TEXT,
  "reportedById"     TEXT NOT NULL,
  "assignedToId"     TEXT,
  "title"            TEXT NOT NULL,
  "description"      TEXT,
  "severity"         "ShiftIssueSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status"           "ShiftIssueStatus" NOT NULL DEFAULT 'OPEN',
  "acknowledgedById" TEXT,
  "acknowledgedAt"   TIMESTAMP(3),
  "resolvedById"     TEXT,
  "resolvedAt"       TIMESTAMP(3),
  "resolutionNote"   TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shift_issues_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shift_issues_organizationId_status_idx" ON "shift_issues"("organizationId","status");
CREATE INDEX IF NOT EXISTS "shift_issues_reportedById_idx" ON "shift_issues"("reportedById");
CREATE INDEX IF NOT EXISTS "shift_issues_assignedToId_idx" ON "shift_issues"("assignedToId");

CREATE TABLE IF NOT EXISTS "shift_issue_events" (
  "id"          TEXT NOT NULL,
  "issueId"     TEXT NOT NULL,
  "type"        "ShiftIssueEventType" NOT NULL,
  "actorId"     TEXT,
  "body"        TEXT,
  "metadata"    JSONB,
  "attachments" JSONB,
  "at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shift_issue_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shift_issue_events_issueId_at_idx" ON "shift_issue_events"("issueId","at");

DO $$ BEGIN
  ALTER TABLE "shift_issue_events"
    ADD CONSTRAINT "shift_issue_events_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "shift_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
