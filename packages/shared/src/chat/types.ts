/**
 * Member-to-member chat — shared, client-safe types. String-literal unions mirror
 * the Prisma enums in the auth-service schema. Single source consumed by web +
 * mobile + backend.
 */

export const CONVERSATION_TYPES = ['DIRECT', 'GROUP'] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export interface ChatUserRef {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  position?: string | null;
  presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null;
}

export interface ChatAttachment {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  attachments: ChatAttachment[];
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  sender?: ChatUserRef | null;
}

export interface ChatConversation {
  id: string;
  organizationId: string;
  type: ConversationType;
  title: string | null; // group name; DMs derive the title from the other member
  lastMessageAt: string | null;
  createdAt: string;
  // Hydrated for display:
  members?: ChatUserRef[];
  otherMember?: ChatUserRef | null; // for DIRECT: the person you're talking to
  lastMessage?: ChatMessage | null;
  unread?: number;
}

/** For a 1:1 conversation, a stable key so two users always share ONE thread. */
export function directConversationKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':');
}

/** Display name for a conversation from the viewer's perspective. */
export function conversationTitle(c: ChatConversation, lang?: string): string {
  if (c.type === 'GROUP') return c.title || (lang?.startsWith('de') ? 'Gruppe' : 'Group');
  const o = c.otherMember;
  return o ? `${o.firstName} ${o.lastName}`.trim() : lang?.startsWith('de') ? 'Unterhaltung' : 'Conversation';
}
