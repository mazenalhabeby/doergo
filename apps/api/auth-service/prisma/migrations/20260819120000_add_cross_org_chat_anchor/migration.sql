-- Cross-org chat: the shared space that authorizes a conversation.
--
-- Additive and idempotent (the shadow database is unusable in this project, so
-- migrations are hand-authored). Existing rows stay NULL, which is exactly
-- right: they are in-org conversations and keep the in-org rules.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "originSpaceId" TEXT;

CREATE INDEX IF NOT EXISTS "conversations_originSpaceId_idx" ON "conversations"("originSpaceId");
