-- Portal request triage gate.
-- Internal tasks are born routed (triaged = true). CUSTOMER_PORTAL requests are
-- created with triaged = false and sit in the portal "pending triage" inbox
-- until an admin routes them (space + flow + priority + worker).
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "triaged" BOOLEAN NOT NULL DEFAULT true;

-- Inbox count/list: pending-triage portal requests per org.
CREATE INDEX IF NOT EXISTS "tasks_organizationId_source_triaged_idx"
  ON "tasks" ("organizationId", "source", "triaged");
