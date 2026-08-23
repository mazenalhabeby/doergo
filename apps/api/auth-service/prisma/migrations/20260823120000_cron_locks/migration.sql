-- One replica per scheduled job.
--
-- NestJS runs a @Cron in every instance of a process, so a second replica of any
-- service means every schedule fires twice — including the nightly billing
-- reconcile that writes Stripe subscription lines. This table is the lease that
-- decides which replica actually runs a given job.
--
-- A row with an expiry rather than pg_advisory_lock: PgBouncer runs in
-- transaction pooling mode, which hands the backend connection to another client
-- between statements and would release a session-level lock under us.
--
-- Idempotent, because the shadow database on this project is unusable and
-- migrations here are hand-authored.

CREATE TABLE IF NOT EXISTS "cron_locks" (
  "name"        TEXT NOT NULL,
  "lockedUntil" TIMESTAMP(3) NOT NULL,
  "lockedBy"    TEXT NOT NULL,
  "lastRunAt"   TIMESTAMP(3),
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cron_locks_pkey" PRIMARY KEY ("name")
);

-- Answers "is anything stuck?" without a sequential scan once this grows.
CREATE INDEX IF NOT EXISTS "cron_locks_lockedUntil_idx" ON "cron_locks" ("lockedUntil");
