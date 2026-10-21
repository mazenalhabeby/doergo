-- Track who actually wrote each work-log note (a member on their own session,
-- or a manager/admin acting on their behalf). Null = legacy row → treat as the
-- session's member (userId). Additive + idempotent (shadow DB is broken).
ALTER TABLE "time_entry_notes" ADD COLUMN IF NOT EXISTS "authorId" TEXT;
