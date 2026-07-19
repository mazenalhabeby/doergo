ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
CREATE TABLE IF NOT EXISTS "notification_watches" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "subjectUserId" TEXT NOT NULL,
  "watcherUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_watches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "notification_watches_subjectUserId_watcherUserId_key" ON "notification_watches"("subjectUserId","watcherUserId");
CREATE INDEX IF NOT EXISTS "notification_watches_subjectUserId_idx" ON "notification_watches"("subjectUserId");
CREATE INDEX IF NOT EXISTS "notification_watches_watcherUserId_idx" ON "notification_watches"("watcherUserId");
CREATE INDEX IF NOT EXISTS "notification_watches_organizationId_idx" ON "notification_watches"("organizationId");
DO $$ BEGIN
  ALTER TABLE "notification_watches" ADD CONSTRAINT "notification_watches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "notification_watches" ADD CONSTRAINT "notification_watches_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "notification_watches" ADD CONSTRAINT "notification_watches_watcherUserId_fkey" FOREIGN KEY ("watcherUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
