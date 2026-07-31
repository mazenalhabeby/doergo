-- Portal-wide request list: filter by (organizationId, source='CUSTOMER_PORTAL')
-- and sort by createdAt DESC. Adds the composite index so Postgres serves the
-- office "all requests in a portal" view without an in-memory sort.
CREATE INDEX IF NOT EXISTS "tasks_organizationId_source_createdAt_idx"
  ON "tasks" ("organizationId", "source", "createdAt");
