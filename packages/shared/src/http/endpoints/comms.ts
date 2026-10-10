/**
 * Talking: member chat, support tickets and in-app notifications.
 * Gateway: modules/chat, modules/support, modules/users (notifications).
 */
import type { ChatAttachment, ChatConversation, ChatMessage, ChatUserRef } from '../../chat/types';
import type { SupportAttachment, SupportMessage, SupportTicket } from '../../support/types';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';
import type { SupportConfig } from '../types';

type Id = { id: string };

export const chatEndpoints = defineEndpoints('chat', {
  contacts: endpoint<void, ChatUserRef[]>({ method: 'GET', path: () => '/chat/contacts', keep: true }),
  conversations: endpoint<void, ChatConversation[]>({ method: 'GET', path: () => '/chat/conversations', keep: true }),
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
  send: endpoint<Id, ChatMessage, { body: string; attachments?: ChatAttachment[] }>({ method: 'POST', path: (a) => path`/chat/conversations/${a.id}/messages` }),
  markRead: endpoint<Id, void>({ method: 'POST', path: (a) => path`/chat/conversations/${a.id}/read` }),
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
