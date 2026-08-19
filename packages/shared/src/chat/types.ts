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
  /** This person works at another company, reachable through a shared space. */
  isExternal?: boolean;
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
  /**
   * A conversation with another organization, held open by a shared space.
   * Surfaced so the reader always knows they are talking outside the company —
   * people share different things when they know that, which makes this a
   * control rather than decoration. It also explains a thread that has stopped
   * accepting messages because the space is no longer shared.
   */
  isExternal?: boolean;
  /**
   * The shared space that held this cross-org conversation open is gone, so it
   * takes no new messages. The history stays readable — closed, not deleted.
   */
  isClosed?: boolean;
}

/** For a 1:1 conversation, a stable key so two users always share ONE thread. */
export function directConversationKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':');
}

/** Display name for a conversation from the viewer's perspective. Null-safe. */
export function conversationTitle(c: ChatConversation | null | undefined, lang?: string): string {
  const fallback = lang?.startsWith('de') ? 'Unterhaltung' : 'Conversation';
  if (!c) return fallback;
  if (c.type === 'GROUP') return c.title || (lang?.startsWith('de') ? 'Gruppe' : 'Group');
  const o = c.otherMember;
  return o ? `${o.firstName} ${o.lastName}`.trim() : fallback;
}
