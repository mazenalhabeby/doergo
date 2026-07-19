-- Owner-scoped customer ticket list (filters createdById, orders by updatedAt).
CREATE INDEX IF NOT EXISTS "support_tickets_createdById_updatedAt_idx"
  ON "support_tickets" ("createdById", "updatedAt");
