import { call, type ApiResponse } from "../http-client"
import { apiError } from "../server-error"
import {
  chatEndpoints,
  peopleEndpoints,
  type ChatAttachment,
  type ChatConversation,
  type ChatMessage,
  type ChatSearchHit,
  type ChatUserRef,
} from "@hbcfield/shared/client"

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
  presign: async (conversationId: string, fileName: string, mimeType: string) => {
    const res = (await call(
      chatEndpoints.presign,
      { id: conversationId },
      { body: { fileName, mimeType } },
    )) as ApiResponse<{ data: { uploadUrl: string; fileKey: string; maxFileSize: number } }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  mute: async (conversationId: string, until: string | null): Promise<{ mutedUntil: string | null }> => {
    const res = (await call(chatEndpoints.mute, { id: conversationId }, { body: { until } })) as ApiResponse<{
      data: { mutedUntil: string | null }
    }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  edit: async (messageId: string, body: string): Promise<ChatMessage> => {
    const res = (await call(chatEndpoints.edit, { id: messageId }, { body: { body } })) as ApiResponse<{
      data: ChatMessage
    }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  remove: async (messageId: string): Promise<ChatMessage> => {
    const res = (await call(chatEndpoints.remove, { id: messageId })) as ApiResponse<{ data: ChatMessage }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  person: async (userId: string) => {
    const res = (await call(peopleEndpoints.person, { id: userId })) as ApiResponse<{
      data: ChatUserRef & { canMessage?: boolean; isManager?: boolean; workspaces?: string[] }
    }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  history: async (conversationId: string, before?: string): Promise<{ data: ChatMessage[]; hasMore: boolean }> => {
    const res = await call(chatEndpoints.messages, { id: conversationId }, { query: { before: before || undefined } }) as ApiResponse<{ data: ChatMessage[]; hasMore: boolean }>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  badge: async (): Promise<{ total: number }> => {
    const res = (await call(chatEndpoints.badge)) as ApiResponse<{ data: { total: number } }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  /** `id` is made here so the bubble drawn before the answer IS the message the server stores. */
  send: async (
    conversationId: string,
    body: string,
    id?: string,
    attachments?: ChatAttachment[],
  ): Promise<ChatMessage> => {
    const res = (await call(
      chatEndpoints.send,
      { id: conversationId },
      { body: { body, attachments, ...(id ? { id } : {}) } },
    )) as ApiResponse<{ data: ChatMessage }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  /** Read a thread; the answer is the caller's TRUE unread total (null when unreachable). Use useMarkRead. */
  markRead: async (conversationId: string): Promise<{ total: number } | null> => {
    const res = (await call(chatEndpoints.markRead, { id: conversationId }, { body: {} })) as ApiResponse<{
      data?: { total: number }
    }>
    return res.error ? null : (res.data?.data ?? null)
  },
  capabilities: async (): Promise<{ mayCreateGroup: boolean }> => {
    const res = (await call(chatEndpoints.capabilities)) as ApiResponse<{ data: { mayCreateGroup: boolean } }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  createGroup: async (title: string, memberIds: string[]): Promise<ChatConversation> => {
    const res = (await call(chatEndpoints.createGroup, undefined, { body: { title, memberIds } })) as ApiResponse<{
      data: ChatConversation
    }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  renameGroup: async (conversationId: string, title: string): Promise<ChatConversation> => {
    const res = (await call(chatEndpoints.renameGroup, { id: conversationId }, { body: { title } })) as ApiResponse<{
      data: ChatConversation
    }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  addMembers: async (conversationId: string, userIds: string[]): Promise<ChatConversation> => {
    const res = (await call(chatEndpoints.addMembers, { id: conversationId }, { body: { userIds } })) as ApiResponse<{
      data: ChatConversation
    }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  removeMember: async (conversationId: string, userId: string): Promise<ChatConversation> => {
    const res = (await call(chatEndpoints.removeMember, { id: conversationId, userId })) as ApiResponse<{
      data: ChatConversation
    }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  leaveGroup: async (conversationId: string): Promise<void> => {
    const res = (await call(chatEndpoints.leaveGroup, { id: conversationId }, { body: {} })) as ApiResponse<unknown>
    if (res.error) throw apiError(res)
  },
  /** A job's chat: opened (or created) for its crew, and the office through the job gate. */
  openTask: async (taskId: string): Promise<ChatConversation> => {
    const res = (await call(chatEndpoints.openTask, { taskId }, { body: {} })) as ApiResponse<{
      data: ChatConversation
    }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  search: async (q: string, before?: string): Promise<{ data: ChatSearchHit[]; hasMore: boolean }> => {
    const res = (await call(chatEndpoints.search, { q, ...(before ? { before } : {}) })) as ApiResponse<{
      data: ChatSearchHit[]
      hasMore: boolean
    }>
    if (res.error) throw apiError(res)
    return res.data!
  },
};
