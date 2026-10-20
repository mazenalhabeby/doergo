/** Events about chat: messages, badges, read marks, members. */
import { event } from '../event';
import type { ChatMessageFacts } from './events-types';

export const chatMessageEvent = event<{
  conversationId: string;
  message: ChatMessageFacts;
  recipients: string[];
  /** ⚠️ Not sent by a SYSTEM line (chat-system.ts) — kept as it is. */
  organizationId?: string;
  unread?: Record<string, number>;
  badge?: Record<string, number>;
  /** Members who switched this thread's pushes off. */
  muted?: string[];
  /** A SYSTEM line ("Anna added Karim"): drawn on screens, never pushed. */
  silent?: boolean;
}>('chat_message');

export const chatBadgeEvent = event<{ userId: string; total: number }>('chat_badge');

export const chatReadEvent = event<{ conversationId: string; userId: string; at: string; memberIds: string[] }>(
  'chat_read',
);

export const chatMembersChangedEvent = event<{ conversationId: string; userIds: string[]; removedIds?: string[] }>(
  'chat_members_changed',
);

export const chatMessageChangedEvent = event<{ conversationId: string; message: unknown; memberIds: string[] }>(
  'chat_message_changed',
);
