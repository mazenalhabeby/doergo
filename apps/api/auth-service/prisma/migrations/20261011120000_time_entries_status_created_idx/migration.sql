-- schema.prisma has declared @@index([status, createdAt]) on TimeEntry, but the index
-- never reached production (found 2026-10-11 by diffing a fresh baseline against the
-- schema). Additive and idempotent.
CREATE INDEX IF NOT EXISTS "time_entries_status_createdAt_idx" ON "time_entries"("status", "createdAt");
