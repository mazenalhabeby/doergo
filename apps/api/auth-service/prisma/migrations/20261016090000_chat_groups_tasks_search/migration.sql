-- Chat phase 3 (additive): groups, a job's chat, full-text search.

ALTER TYPE "ConversationType" ADD VALUE 'TASK';

CREATE TYPE "ChatMemberVia" AS ENUM ('OPENED', 'ADDED', 'CREW', 'OFFICE');
CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'SYSTEM');

-- One chat per job, created on first open.
ALTER TABLE "conversations" ADD COLUMN "taskId" TEXT;
CREATE UNIQUE INDEX "conversations_taskId_key" ON "conversations"("taskId");
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- How a member came to be in a conversation. Existing rows opened their DM.
ALTER TABLE "conversation_members" ADD COLUMN "joinedVia" "ChatMemberVia" NOT NULL DEFAULT 'OPENED';

-- A line the system writes about the conversation (created, renamed, added, removed, left).
ALTER TABLE "messages"
  ADD COLUMN "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "meta" JSONB;

-- ⚠️ Search. 'simple' = no stemming, so it behaves the same in every language
-- (German, Arabic, …). Generated, so no writer can forget it. Not in the Prisma
-- schema (it cannot express a generated column): a `migrate diff` lists it as drift — keep it.
ALTER TABLE "messages"
  ADD COLUMN "search" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("body", ''))) STORED;
CREATE INDEX "messages_search_idx" ON "messages" USING GIN ("search");
