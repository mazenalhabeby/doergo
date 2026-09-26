-- The home Clients card reads open reminders due by today across the book.
-- Additive and idempotent.
CREATE INDEX IF NOT EXISTS "customer_activities_organizationId_type_doneAt_dueAt_idx"
  ON "customer_activities"("organizationId", "type", "doneAt", "dueAt");
