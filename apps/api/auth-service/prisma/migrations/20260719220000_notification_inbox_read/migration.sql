-- Persistent in-app notification inbox: add a read-state column + unread index
-- to the (previously unused) notification_deliveries table. Idempotent + safe.
ALTER TABLE "notification_deliveries" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "notification_deliveries_recipientId_readAt_idx"
  ON "notification_deliveries" ("recipientId", "readAt");
