-- Chat phase 2 (additive): mute per conversation, change cursors for the
-- phone's pull, and indexes for paging older history by (createdAt, id).

ALTER TABLE "conversation_members"
  ADD COLUMN "mutedUntil" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "messages"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- An existing message changed last when it was written.
UPDATE "messages" SET "updatedAt" = COALESCE("deletedAt", "editedAt", "createdAt");

CREATE INDEX "conversation_members_userId_updatedAt_idx" ON "conversation_members"("userId", "updatedAt");
CREATE INDEX "messages_conversationId_createdAt_id_idx" ON "messages"("conversationId", "createdAt", "id");
CREATE INDEX "messages_conversationId_updatedAt_id_idx" ON "messages"("conversationId", "updatedAt", "id");
