/**
 * Talking: member chat, support tickets and in-app notifications.
 * Gateway: modules/chat, modules/support, modules/users (notifications).
 */
import type { ChatAttachment, ChatConversation, ChatMessage, ChatSearchHit, ChatUserRef } from '../../chat/types';
import type { SupportAttachment, SupportMessage, SupportTicket } from '../../support/types';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';
import type { SupportConfig } from '../types';

type Id = { id: string };

export const chatEndpoints = defineEndpoints('chat', {
  contacts: endpoint<void, ChatUserRef[]>({ method: 'GET', path: () => '/chat/contacts', keep: true }),
  conversations: endpoint<void, ChatConversation[]>({ method: 'GET', path: () => '/chat/conversations', keep: true }),
  /** The caller's unread total across every thread — one indexed sum, for a badge. */
  badge: endpoint<void, { total: number }>({ method: 'GET', path: () => '/chat/badge' }),
  /** Open (or find) the direct conversation with one person. */
  openDirect: endpoint<void, ChatConversation, { userId: string }>({ method: 'POST', path: () => '/chat/conversations' }),
  /**
   * A page of history, newest first. The answer is `{ data, hasMore }` with no
   * `success`: unwrapped it is the messages; `unwrap: 'raw'` keeps `hasMore`.
   */
  messages: endpoint<Id & { before?: string }, ChatMessage[]>({
    method: 'GET',
    path: ({ id, ...q }) => withQuery(path`/chat/conversations/${id}/messages`, q),
    keep: true,
  }),
  send: endpoint<Id, ChatMessage, { body: string; attachments?: ChatAttachment[]; id?: string; sentAt?: string }>({
    method: 'POST',
    path: (a) => path`/chat/conversations/${a.id}/messages`,
  }),
  /** Read a thread; the answer is the caller's TRUE unread total — every screen sets its badge from it. */
  markRead: endpoint<Id, { total: number }>({ method: 'POST', path: (a) => path`/chat/conversations/${a.id}/read` }),
  /** An upload link for one file into a conversation (then PUT, then send the key). */
  presign: endpoint<
    Id,
    { uploadUrl: string; headers?: Record<string, string>; fileKey: string; expiresIn: number; maxFileSize: number },
    { fileName: string; mimeType: string }
  >({
    method: 'POST',
    path: (a) => path`/chat/conversations/${a.id}/attachments/presign`,
  }),
  /** Pushes for one conversation off until a moment; null turns them back on. */
  mute: endpoint<Id, { mutedUntil: string | null }, { until: string | null }>({
    method: 'PATCH',
    path: (a) => path`/chat/conversations/${a.id}/mute`,
  }),
  /** Your own message, for 15 minutes after sending (shared mayChangeMessage). */
  edit: endpoint<Id, ChatMessage, { body: string }>({ method: 'PATCH', path: (a) => path`/chat/messages/${a.id}` }),
  remove: endpoint<Id, ChatMessage>({ method: 'DELETE', path: (a) => path`/chat/messages/${a.id}` }),

  /** What the caller may do in chat (start a group: managers and leaders). */
  capabilities: endpoint<void, { mayCreateGroup: boolean }>({
    method: 'GET',
    path: () => '/chat/capabilities',
    keep: true,
  }),

  // ── Groups ──
  /** Start a group: the caller must be allowed to message every person in it. */
  createGroup: endpoint<void, ChatConversation, { title: string; memberIds: string[] }>({
    method: 'POST',
    path: () => '/chat/groups',
  }),
  renameGroup: endpoint<Id, ChatConversation, { title: string }>({
    method: 'PATCH',
    path: (a) => path`/chat/groups/${a.id}`,
  }),
  addMembers: endpoint<Id, ChatConversation, { userIds: string[] }>({
    method: 'POST',
    path: (a) => path`/chat/groups/${a.id}/members`,
  }),
  removeMember: endpoint<Id & { userId: string }, ChatConversation>({
    method: 'DELETE',
    path: (a) => path`/chat/groups/${a.id}/members/${a.userId}`,
  }),
  leaveGroup: endpoint<Id, void>({ method: 'POST', path: (a) => path`/chat/groups/${a.id}/leave` }),

  // ── A job's chat ──
  /** Open (or create) one job's chat — for its crew, and the office through the job gate. */
  openTask: endpoint<{ taskId: string }, ChatConversation>({
    method: 'POST',
    path: (a) => path`/chat/tasks/${a.taskId}`,
  }),

  // ── Search (online only) ──
  /** Words in the caller's own conversations, newest first; `before` = the last hit's "createdAt|id". */
  search: endpoint<{ q: string; before?: string }, ChatSearchHit[]>({
    method: 'GET',
    path: (q) => withQuery('/chat/search', q),
  }),
});

/** One colleague as the caller's Team shows them (gateway modules/people). */
export const peopleEndpoints = defineEndpoints('people', {
  person: endpoint<
    Id,
    ChatUserRef & {
      canMessage?: boolean;
      isManager?: boolean;
      workspaces?: string[];
      spaceName?: string | null;
      [k: string]: unknown;
    }
  >({
    method: 'GET',
    path: (a) => path`/people/${a.id}`,
    keep: true,
  }),
});

export const supportEndpoints = defineEndpoints('support', {
  config: endpoint<void, SupportConfig>({ method: 'GET', path: () => '/support/config', keep: true }),
  tickets: endpoint<{ status?: string } | void, SupportTicket[]>({ method: 'GET', path: (q) => withQuery('/support/tickets', q || undefined), keep: true }),
  ticket: endpoint<Id, SupportTicket>({ method: 'GET', path: (a) => path`/support/tickets/${a.id}`, keep: true }),
  create: endpoint<void, SupportTicket, { subject: string; body: string; category?: string; attachments?: SupportAttachment[]; [k: string]: unknown }>({
    method: 'POST',
    path: () => '/support/tickets',
  }),
  reply: endpoint<Id, SupportMessage, { body: string; attachments?: SupportAttachment[] }>({ method: 'POST', path: (a) => path`/support/tickets/${a.id}/messages` }),
  markRead: endpoint<Id, void>({ method: 'POST', path: (a) => path`/support/tickets/${a.id}/read` }),
});

export const notificationsEndpoints = defineEndpoints('notifications', {
  list: endpoint<{ limit?: number } | void, unknown>({ method: 'GET', path: (q) => withQuery('/users/me/notifications', q || undefined) }),
  markRead: endpoint<void, unknown, { ids?: string[]; all?: boolean; [k: string]: unknown }>({ method: 'POST', path: () => '/users/me/notifications/read' }),
  /** The member's own switches, and which member emails the organization allows at all. */
  prefs: endpoint<void, { prefs: Record<string, boolean>; organizationAllows: Record<string, boolean> }>({
    method: 'GET',
    path: () => '/users/me/notification-prefs',
    keep: true,
  }),
  /** Merge-update: only the keys given change. */
  updatePrefs: endpoint<void, Record<string, boolean>, { prefs: Record<string, boolean> }>({ method: 'PATCH', path: () => '/users/me/notification-prefs' }),
});
