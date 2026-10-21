-- P4: the no-show materialize sweep filters shift_assignments on
-- isActive + effectiveFrom (<= horizon); no index led with those columns, so at
-- scale it was a full scan (and the old take:5000 cap silently dropped the tail).
-- Additive + idempotent.
CREATE INDEX IF NOT EXISTS "shift_assignments_isActive_effectiveFrom_idx"
  ON "shift_assignments" ("isActive", "effectiveFrom");
