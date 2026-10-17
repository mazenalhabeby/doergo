import { Prisma } from '@prisma/client';

/**
 * The conversation list's order: the most recent message first, and threads with NO message yet
 * (`lastMessageAt` NULL) at the bottom, newest opened first. Postgres sorts NULLs FIRST on a
 * DESC order, so a plain `lastMessageAt: 'desc'` put every empty thread above every real one.
 */
export const CONVERSATION_LIST_ORDER: Prisma.ConversationOrderByWithRelationInput[] = [
  { lastMessageAt: { sort: 'desc', nulls: 'last' } },
  { createdAt: 'desc' },
];
