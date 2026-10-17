/**
 * A NEW MESSAGE IS PUT IN PLACE, NOT RELOADED — one set of rules for the web
 * and the phone.
 *
 * Every message on the socket used to cost each open screen a reload of the
 * conversation list and of the open thread. The socket event now carries what a
 * screen needs (the message, this person's unread count for the thread, and
 * their unread total), and these functions put it where it belongs. Only a
 * payload that cannot be placed (no message, a thread never listed) reloads.
 *
 * Plain TypeScript, no framework, so both apps and the tests share it.
 */
import type { ChatConversation, ChatMessage } from './types';

/** `chat.message` as each member receives it: their OWN numbers ride along. */
export interface ChatMessageEvent {
  conversationId: string;
  message: ChatMessage;
  /** This person's unread count for the thread after the message (absent on old servers). */
  unread?: number;
  /** This person's unread total across every thread (absent on old servers). */
  badge?: number;
}

/** `chat.badge`: the unread total changed (read on another device, or a message arrived). */
export interface ChatBadgeEvent {
  total: number;
}

/** `chat.conversationUpdated`: members or name changed; `removed` = this person was taken out. */
export interface ChatConversationUpdatedEvent {
  conversationId: string;
  removed?: boolean;
}

/** `chat.typing`: somebody in the thread is typing (`from` = their user id). */
export interface ChatTypingEvent {
  conversationId: string;
  from: string;
}

type Stamped = { id: string; createdAt?: string | null };

/** Usable as a message: it has an id. Anything less is a reason to reload. */
export function isPlaceable(msg: unknown): msg is Stamped {
  return !!msg && typeof (msg as Stamped).id === 'string' && (msg as Stamped).id.length > 0;
}

const stamp = (m: Stamped) => (m.createdAt ? Date.parse(m.createdAt) : NaN);

/**
 * Put `msg` into a thread kept oldest → newest. The same id REPLACES (the
 * server's copy wins); a new one goes after the last message not newer than it,
 * almost always the end. The list is never mutated; the same array comes back
 * when nothing changed.
 */
export function appendMessage<M extends Stamped>(list: readonly M[], msg: M): M[] {
  const at = list.findIndex((m) => m.id === msg.id);
  if (at >= 0) {
    if (list[at] === msg) return list as M[];
    const next = list.slice();
    next[at] = { ...list[at], ...msg };
    return next;
  }
  const t = stamp(msg);
  let i = list.length;
  if (!Number.isNaN(t)) {
    while (i > 0) {
      const prev = stamp(list[i - 1]!);
      if (Number.isNaN(prev) || prev <= t) break;
      i--;
    }
  }
  const next = list.slice();
  next.splice(i, 0, msg);
  return next;
}

/**
 * The conversation list after a message: the row carries it as its last
 * message, takes the unread count the server sent (or counts it itself for an
 * old server), and moves to the top. An open thread reads 0. `known: false`
 * when the thread is not in the list (somebody started a new one): only a
 * reload can draw that.
 */
export function applyToConversations(
  list: readonly ChatConversation[],
  evt: { conversationId?: string | null; message?: unknown; unread?: number },
  me: { meId?: string | null; openId?: string | null },
): { list: ChatConversation[]; known: boolean } {
  const id = evt.conversationId ?? (evt.message as ChatMessage | undefined)?.conversationId;
  const msg = evt.message as ChatMessage | undefined;
  const at = id ? list.findIndex((c) => c.id === id) : -1;
  if (at < 0 || !isPlaceable(msg)) return { list: list as ChatConversation[], known: false };
  const conv = list[at]!;
  // A SYSTEM line ("Anna added Karim") is nobody's words: it neither counts as
  // unread nor becomes the row's preview. The membership event re-reads the row.
  if ((msg as ChatMessage).kind === 'SYSTEM') return { list: list as ChatConversation[], known: true };
  const mine = msg.senderId === me.meId;
  const seen = conv.lastMessage?.id === msg.id;
  const counted = mine || seen ? (conv.unread ?? 0) : (conv.unread ?? 0) + 1;
  const updated: ChatConversation = {
    ...conv,
    lastMessage: msg,
    lastMessageAt: msg.createdAt ?? conv.lastMessageAt,
    unread: id === me.openId ? 0 : typeof evt.unread === 'number' ? evt.unread : counted,
  };
  return { list: [updated, ...list.slice(0, at), ...list.slice(at + 1)], known: true };
}

/** Clear a conversation's unread count the moment it is read. */
export function markReadLocally(list: readonly ChatConversation[], id: string): ChatConversation[] {
  const at = list.findIndex((c) => c.id === id);
  if (at < 0 || !list[at]!.unread) return list as ChatConversation[];
  const next = list.slice();
  next[at] = { ...list[at]!, unread: 0 };
  return next;
}

/** `chat.read`: a member read a thread — "Read" under what the others wrote. */
export interface ChatReadEvent {
  conversationId: string;
  userId: string;
  at: string;
}

/** `chat.messageChanged`: an edit or a removal, to put in place of the old copy. */
export interface ChatMessageChangedEvent {
  conversationId: string;
  message: ChatMessage;
}

/**
 * The list after somebody read a thread: their read time moves (never backwards).
 * When the reader is ME (on another screen or device), the row's unread count is
 * 0 too — otherwise a thread read on the phone kept its number on the web.
 */
export function applyRead(
  list: readonly ChatConversation[],
  evt: ChatReadEvent,
  meId?: string | null,
): ChatConversation[] {
  const at = list.findIndex((c) => c.id === evt.conversationId);
  if (at < 0) return list as ChatConversation[];
  const conv = list[at]!;
  const mine = !!meId && evt.userId === meId;
  const before = conv.readAt?.[evt.userId];
  const moves = !(before && Date.parse(before) >= Date.parse(evt.at));
  if (!moves && !(mine && conv.unread)) return list as ChatConversation[];
  const next = list.slice();
  next[at] = {
    ...conv,
    ...(moves ? { readAt: { ...(conv.readAt ?? {}), [evt.userId]: evt.at } } : null),
    ...(mine ? { unread: 0 } : null),
  };
  return next;
}

/** The list after an edit or removal: only the row whose newest message it was changes. */
export function applyChangedToConversations(
  list: readonly ChatConversation[],
  evt: ChatMessageChangedEvent,
): ChatConversation[] {
  const at = list.findIndex((c) => c.id === evt.conversationId && c.lastMessage?.id === evt.message?.id);
  if (at < 0) return list as ChatConversation[];
  const next = list.slice();
  next[at] = { ...list[at]!, lastMessage: { ...list[at]!.lastMessage!, ...evt.message } };
  return next;
}

/** Replace a message wherever a thread holds it (an edit, a removal). Unknown ids change nothing. */
export function replaceMessage<M extends { id: string }>(list: readonly M[], msg: M): M[] {
  const at = list.findIndex((m) => m.id === msg.id);
  if (at < 0) return list as M[];
  const next = list.slice();
  next[at] = msg;
  return next;
}

/** The unread total of a list, for a badge drawn before the server's number arrives. */
export function unreadTotal(list: readonly ChatConversation[] | null | undefined): number {
  return (list ?? []).reduce((n, c) => n + (c.unread ?? 0), 0);
}
