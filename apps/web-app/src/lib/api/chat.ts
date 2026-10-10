import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import { chatEndpoints, type ChatAttachment, type ChatConversation, type ChatMessage, type ChatUserRef } from '@hbcfield/shared/client';

export const chatApi = {
  contacts: async (): Promise<ChatUserRef[]> => {
    const res = await call(chatEndpoints.contacts) as ApiResponse<{ data: ChatUserRef[] }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  conversations: async (): Promise<ChatConversation[]> => {
    const res = await call(chatEndpoints.conversations) as ApiResponse<{ data: ChatConversation[] }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  openDirect: async (userId: string): Promise<ChatConversation> => {
    const res = await call(chatEndpoints.openDirect, undefined, { body: { userId } }) as ApiResponse<{ data: ChatConversation }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  history: async (conversationId: string, before?: string): Promise<{ data: ChatMessage[]; hasMore: boolean }> => {
    const res = await call(chatEndpoints.messages, { id: conversationId }, { query: { before: before || undefined } }) as ApiResponse<{ data: ChatMessage[]; hasMore: boolean }>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  send: async (conversationId: string, body: string, attachments?: ChatAttachment[]): Promise<ChatMessage> => {
    const res = await call(chatEndpoints.send, { id: conversationId }, { body: { body, attachments } }) as ApiResponse<{ data: ChatMessage }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  markRead: async (conversationId: string): Promise<void> => {
    await call(chatEndpoints.markRead, { id: conversationId }, { body: {} }) as ApiResponse<unknown>;
  },
};
