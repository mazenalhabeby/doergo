-- Chat counters (additive). The conversation keeps its newest message and each
-- member keeps their unread count, so the list and the badge stop counting rows.

ALTER TABLE "conversations"
  ADD COLUMN "lastMessageId" TEXT,
  ADD COLUMN "lastMessagePreview" TEXT,
  ADD COLUMN "lastSenderId" TEXT;

ALTER TABLE "conversation_members"
  ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: each conversation's newest message.
UPDATE "conversations" c
SET "lastMessageId" = m."id",
    "lastMessagePreview" = LEFT(m."body", 140),
    "lastSenderId" = m."senderId"
FROM (
  SELECT DISTINCT ON ("conversationId") "id", "conversationId", "body", "senderId"
  FROM "messages"
  ORDER BY "conversationId", "createdAt" DESC, "id" DESC
) m
WHERE m."conversationId" = c."id";

-- Backfill: unread = messages from others after the member's last read (the
-- same rule the list used to count on every request).
UPDATE "conversation_members" cm
SET "unreadCount" = x.n
FROM (
  SELECT cm2."id", COUNT(m."id")::int AS n
  FROM "conversation_members" cm2
  JOIN "messages" m
    ON m."conversationId" = cm2."conversationId"
   AND m."senderId" <> cm2."userId"
   AND (cm2."lastReadAt" IS NULL OR m."createdAt" > cm2."lastReadAt")
  GROUP BY cm2."id"
) x
WHERE x."id" = cm."id";
