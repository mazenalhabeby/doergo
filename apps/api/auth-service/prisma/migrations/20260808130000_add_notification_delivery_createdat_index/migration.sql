-- Additive index (audit H4). The NotificationDelivery retention sweep filters on
-- createdAt alone; index it so the nightly prune uses an index scan.
-- NOTE for prod: on an already-large table use CREATE INDEX CONCURRENTLY out-of-band.
CREATE INDEX IF NOT EXISTS "notification_deliveries_createdAt_idx" ON "notification_deliveries" ("createdAt");
