import { call, E } from './client';
import type {
  ChatConversation,
  ChatMessage,
  ChatSearchHit,
  ChatUserRef,
  ChatAttachment,
} from '@hbcfield/shared/client';

// Member-to-member chat API (mirrors the web chatApi).
// NOTE: the client already unwraps the `{ data }` envelope
// (`envelope.ts`), so we must NOT read `.data` a second time.
/** The server's default page of history. */
const CHAT_PAGE = 30;

export const chatApi = {
  contacts: async (): Promise<ChatUserRef[]> => {
    return (await call(E.chat.contacts)) ?? [];
  },
  conversations: async (): Promise<ChatConversation[]> => {
    return (await call(E.chat.conversations)) ?? [];
  },
  /** The unread total across every conversation — one indexed sum on the server. */
  badge: async (): Promise<{ total: number }> => {
    return (await call(E.chat.badge)) ?? { total: 0 };
  },
  openDirect: async (userId: string): Promise<ChatConversation> => {
    return call(E.chat.openDirect, undefined, { body: { userId } });
  },
  /** A page older than `before` ("createdAt|id", shared historyCursor); a full page means there may be more. */
  history: async (conversationId: string, before?: string): Promise<{ data: ChatMessage[]; hasMore: boolean }> => {
    const rows: ChatMessage[] | null = await call(E.chat.messages, { id: conversationId, before });
    return { data: rows ?? [], hasMore: (rows?.length ?? 0) >= CHAT_PAGE };
  },
  presign: async (
    conversationId: string,
    fileName: string,
    mimeType: string,
  ): Promise<{ uploadUrl: string; fileKey: string }> => {
    return call(E.chat.presign, { id: conversationId }, { body: { fileName, mimeType } });
  },
  mute: async (conversationId: string, until: string | null): Promise<{ mutedUntil: string | null }> => {
    return call(E.chat.mute, { id: conversationId }, { body: { until } });
  },
  edit: async (messageId: string, body: string): Promise<ChatMessage> => {
    return call(E.chat.edit, { id: messageId }, { body: { body } });
  },
  remove: async (messageId: string): Promise<ChatMessage> => {
    return call(E.chat.remove, { id: messageId });
  },
  /** One colleague as Team shows them (never more). */
  person: async (userId: string) => {
    return call(E.people.person, { id: userId });
  },
  send: async (
    conversationId: string,
    body: string,
    attachments?: ChatAttachment[],
    id?: string,
  ): Promise<ChatMessage> => {
    return call(E.chat.send, { id: conversationId }, { body: { body, attachments, ...(id ? { id } : {}) } });
  },
  /** Read a thread. The answer is the caller's true unread total — use markConversationRead, which applies it. */
  markRead: async (conversationId: string): Promise<{ total: number } | null> => {
    return (await call(E.chat.markRead, { id: conversationId })) ?? null;
  },
  /** What the caller may do in chat (start a group: managers and leaders). */
  capabilities: async (): Promise<{ mayCreateGroup: boolean }> => {
    return (await call(E.chat.capabilities)) ?? { mayCreateGroup: false };
  },
  createGroup: async (title: string, memberIds: string[]): Promise<ChatConversation> => {
    return call(E.chat.createGroup, undefined, { body: { title, memberIds } });
  },
  renameGroup: async (conversationId: string, title: string): Promise<ChatConversation> => {
    return call(E.chat.renameGroup, { id: conversationId }, { body: { title } });
  },
  addMembers: async (conversationId: string, userIds: string[]): Promise<ChatConversation> => {
    return call(E.chat.addMembers, { id: conversationId }, { body: { userIds } });
  },
  removeMember: async (conversationId: string, userId: string): Promise<ChatConversation> => {
    return call(E.chat.removeMember, { id: conversationId, userId });
  },
  leaveGroup: async (conversationId: string): Promise<void> => {
    await call(E.chat.leaveGroup, { id: conversationId });
  },
  /** A job's chat — its crew, and the office through the job gate. ONLINE: it may be created. */
  openTask: async (taskId: string): Promise<ChatConversation> => {
    return call(E.chat.openTask, { taskId });
  },
  /** Words in the caller's own conversations. ONLINE ONLY (the phone keeps no index). */
  search: async (q: string): Promise<ChatSearchHit[]> => {
    return (await call(E.chat.search, { q })) ?? [];
  },
};
