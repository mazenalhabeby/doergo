import { call, E } from './client';
import type { ChatConversation, ChatMessage, ChatUserRef, ChatAttachment } from '@hbcfield/shared/client';

// Member-to-member chat API (mirrors the web chatApi).
// NOTE: the client already unwraps the `{ data }` envelope
// (`envelope.ts`), so we must NOT read `.data` a second time.
export const chatApi = {
  contacts: async (): Promise<ChatUserRef[]> => {
    return (await call(E.chat.contacts)) ?? [];
  },
  conversations: async (): Promise<ChatConversation[]> => {
    return (await call(E.chat.conversations)) ?? [];
  },
  openDirect: async (userId: string): Promise<ChatConversation> => {
    return call(E.chat.openDirect, undefined, { body: { userId } });
  },
  history: async (conversationId: string, before?: string): Promise<{ data: ChatMessage[]; hasMore: boolean }> => {
    // The envelope's `hasMore` is collapsed by the auto-unwrap; mobile shows the
    // latest page only, so `hasMore: false` is fine until load-more lands.
    const rows: ChatMessage[] | null = await call(E.chat.messages, { id: conversationId, before });
    return { data: rows ?? [], hasMore: false };
  },
  send: async (conversationId: string, body: string, attachments?: ChatAttachment[]): Promise<ChatMessage> => {
    return call(E.chat.send, { id: conversationId }, { body: { body, attachments } });
  },
  markRead: async (conversationId: string): Promise<void> => {
    await call(E.chat.markRead, { id: conversationId });
  },
};
