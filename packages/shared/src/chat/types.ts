/**
 * Member-to-member chat — shared, client-safe types. String-literal unions mirror
 * the Prisma enums in the auth-service schema. Single source consumed by web +
 * mobile + backend.
 */
import { personName } from '../people/person-name';

export const CONVERSATION_TYPES = ['DIRECT', 'GROUP', 'TASK'] as const;
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

/**
 * A file in a message — the same shape every other upload in the product uses
 * (shift issues, work log). The KEY is stored; `url` is a short-lived signed
 * link added when the message is read, never stored.
 */
export interface ChatAttachment {
  fileKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  url?: string | null;
}

/** What happened, for a line the system writes into a conversation. */
export const CHAT_SYSTEM_EVENTS = ['CREATED', 'RENAMED', 'ADDED', 'REMOVED', 'LEFT'] as const;
export type ChatSystemEvent = (typeof CHAT_SYSTEM_EVENTS)[number];

/**
 * A SYSTEM line's facts. Names are a snapshot taken when it happened, so the
 * line still reads "Anna removed Karim" after Karim left the company. The apps
 * write the sentence in the reader's language (`chatSystemLine`).
 */
export interface ChatSystemMeta {
  event: ChatSystemEvent;
  actor: { id: string; name: string };
  users?: { id: string; name: string }[];
  title?: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  /** TEXT (absent on old servers) or SYSTEM — a line about the conversation, never editable. */
  kind?: 'TEXT' | 'SYSTEM';
  meta?: ChatSystemMeta | null;
  body: string;
  attachments: ChatAttachment[];
  createdAt: string;
  /** When the sender wrote it, for a message delivered late from offline. */
  sentAt?: string | null;
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
  /** Each member's last read (ISO) — what "✓✓ Read" / "Seen by N" is drawn from. */
  readAt?: Record<string, string | null>;
  /** Pushes for this thread are off until then (the caller's own choice). */
  mutedUntil?: string | null;
  /** Who started it (a group's creator). */
  createdById?: string;
  /** A job's chat: the job, read live (its title is the chat's name). */
  task?: { id: string; title: string; status: string } | null;
  /** The caller may rename it and add or remove people (a group's creator, or a manager). */
  canManage?: boolean;
}

/** One search hit: the message, and enough of its conversation to name it. */
export interface ChatSearchHit {
  message: ChatMessage;
  conversation: Pick<ChatConversation, 'id' | 'type' | 'title' | 'otherMember' | 'task' | 'isExternal'>;
}

/** For a 1:1 conversation, a stable key so two users always share ONE thread. */
export function directConversationKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':');
}

/** Display name for a conversation from the viewer's perspective. Null-safe. */
export function conversationTitle(c: ChatConversation | null | undefined, lang?: string): string {
  const fallback = lang?.startsWith('de') ? 'Unterhaltung' : 'Conversation';
  if (!c) return fallback;
  if (c.type === 'TASK') return c.task?.title || c.title || (lang?.startsWith('de') ? 'Auftrag' : 'Job');
  if (c.type === 'GROUP') return c.title || (lang?.startsWith('de') ? 'Gruppe' : 'Group');
  const o = c.otherMember;
  return o ? personName(o) : fallback;
}
