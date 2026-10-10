import { fetchWithAuth } from './client';
import { path } from './path';
import { buildUrlWithQuery } from '@hbcfield/shared/client';
import type { ChatConversation, ChatMessage, ChatUserRef, ChatAttachment } from '@hbcfield/shared/client';

// Member-to-member chat API (mirrors the web chatApi).
// NOTE: mobile `fetchWithAuth` already unwraps the `{ data }` envelope
// (`envelope.ts`), so we must NOT read `.data` a second time.
export const chatApi = {
  contacts: async (): Promise<ChatUserRef[]> => {
    return (await fetchWithAuth<ChatUserRef[]>('/chat/contacts', { method: 'GET' })) ?? [];
  },
  conversations: async (): Promise<ChatConversation[]> => {
    return (await fetchWithAuth<ChatConversation[]>('/chat/conversations', { method: 'GET' })) ?? [];
  },
  openDirect: async (userId: string): Promise<ChatConversation> => {
    return fetchWithAuth<ChatConversation>('/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },
  history: async (conversationId: string, before?: string): Promise<{ data: ChatMessage[]; hasMore: boolean }> => {
    // The envelope's `hasMore` is collapsed by the auto-unwrap; mobile shows the
    // latest page only, so `hasMore: false` is fine until load-more lands.
    const rows = await fetchWithAuth<ChatMessage[]>(
      buildUrlWithQuery(path`/chat/conversations/${conversationId}/messages`, { before }),
      { method: 'GET' },
    );
    return { data: rows ?? [], hasMore: false };
  },
  send: async (conversationId: string, body: string, attachments?: ChatAttachment[]): Promise<ChatMessage> => {
    return fetchWithAuth<ChatMessage>(path`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, attachments }),
    });
  },
  markRead: async (conversationId: string): Promise<void> => {
    await fetchWithAuth(path`/chat/conversations/${conversationId}/read`, { method: 'POST', body: '{}' });
  },
};
