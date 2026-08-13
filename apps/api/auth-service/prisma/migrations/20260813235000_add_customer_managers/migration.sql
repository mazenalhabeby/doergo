-- Multiple sales managers assigned to a CRM customer. Cleared on app-access handoff.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "managerIds" TEXT[] NOT NULL DEFAULT '{}';
