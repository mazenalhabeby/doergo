import { fetchWithAuth } from './client';
import type { ChatConversation, ChatMessage, ChatUserRef, ChatAttachment } from '@hbcfield/shared/client';

// Member-to-member chat API (mirrors the web chatApi).
export const chatApi = {
  contacts: async (): Promise<ChatUserRef[]> => {
    const res = await fetchWithAuth<{ data: ChatUserRef[] }>('/chat/contacts', { method: 'GET' });
    return res.data;
  },
  conversations: async (): Promise<ChatConversation[]> => {
    const res = await fetchWithAuth<{ data: ChatConversation[] }>('/chat/conversations', { method: 'GET' });
    return res.data;
  },
  openDirect: async (userId: string): Promise<ChatConversation> => {
    const res = await fetchWithAuth<{ data: ChatConversation }>('/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return res.data;
  },
  history: async (conversationId: string, before?: string): Promise<{ data: ChatMessage[]; hasMore: boolean }> => {
    return fetchWithAuth(`/chat/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`, {
      method: 'GET',
    });
  },
  send: async (conversationId: string, body: string, attachments?: ChatAttachment[]): Promise<ChatMessage> => {
    const res = await fetchWithAuth<{ data: ChatMessage }>(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, attachments }),
    });
    return res.data;
  },
  markRead: async (conversationId: string): Promise<void> => {
    await fetchWithAuth(`/chat/conversations/${conversationId}/read`, { method: 'POST', body: '{}' });
  },
};
