-- The default task list (no status filter) reads one organization's tasks newest first. Without
-- this index Postgres walks tasks_createdAt_idx across every organization and filters, which
-- grows with OTHER tenants' data. Additive.
CREATE INDEX IF NOT EXISTS "tasks_organizationId_createdAt_idx" ON "tasks"("organizationId", "createdAt");
