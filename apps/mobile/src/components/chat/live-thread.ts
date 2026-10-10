/**
 * A NEW MESSAGE IS ADDED, NOT RELOADED — the rules for chat and support.
 *
 * ⚠️ Every message that arrived on the socket cost three requests and a
 * redraw of everything: the conversation list, the WHOLE history of the open
 * thread, and a mark-read — for a payload that already carried the message.
 * The socket's message is now put where it belongs; the list's row moves to
 * the top with it; the read mark waits a second so a burst is one request.
 * Only when the payload cannot be placed (no message, a conversation this
 * phone has never listed) does a reload happen — debounced, once per burst.
 *
 * Plain TypeScript (no React Native) so it is unit-tested.
 */
import type { ChatConversation, ChatMessage } from '@hbcfield/shared/client';

type Stamped = { id: string; createdAt?: string | null };

/** Usable as a message: it has an id. Anything less is a reason to reload. */
export function isPlaceable(msg: unknown): msg is Stamped {
  return !!msg && typeof (msg as Stamped).id === 'string' && (msg as Stamped).id.length > 0;
}

const stamp = (m: Stamped) => (m.createdAt ? Date.parse(m.createdAt) : NaN);

/**
 * Put `msg` into a thread kept oldest → newest.
 *
 * The same id REPLACES (the server's copy of a message this phone already
 * shows wins); a new one goes after the last message not newer than it —
 * almost always the end, so this is O(1) in practice. The list is never
 * mutated; the same array comes back when nothing changed.
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
 * message, counts it unread (unless it is mine or the thread is open), and
 * moves to the top. `known: false` when the conversation is not in the list —
 * a new thread somebody started — which only a reload can draw.
 */
export function applyToConversations(
  list: readonly ChatConversation[],
  evt: { conversationId?: string | null; message?: unknown },
  me: { meId?: string | null; openId?: string | null },
): { list: ChatConversation[]; known: boolean } {
  const id = evt.conversationId ?? (evt.message as ChatMessage | undefined)?.conversationId;
  const msg = evt.message as ChatMessage | undefined;
  const at = id ? list.findIndex((c) => c.id === id) : -1;
  if (at < 0 || !isPlaceable(msg)) return { list: list as ChatConversation[], known: false };
  const conv = list[at]!;
  const mine = msg.senderId === me.meId;
  const open = id === me.openId;
  // A copy of a message already counted (the socket said it twice) changes nothing.
  const seen = conv.lastMessage?.id === msg.id;
  const updated: ChatConversation = {
    ...conv,
    lastMessage: msg,
    lastMessageAt: msg.createdAt ?? conv.lastMessageAt,
    unread: open ? 0 : mine || seen ? conv.unread ?? 0 : (conv.unread ?? 0) + 1,
  };
  return { list: [updated, ...list.slice(0, at), ...list.slice(at + 1)], known: true };
}

/** Clear a conversation's unread count on the phone the moment it is read. */
export function markReadLocally(list: readonly ChatConversation[], id: string): ChatConversation[] {
  const at = list.findIndex((c) => c.id === id);
  if (at < 0 || !list[at]!.unread) return list as ChatConversation[];
  const next = list.slice();
  next[at] = { ...list[at]!, unread: 0 };
  return next;
}

/**
 * Call `fn` once, `ms` after the LAST call — a burst of socket events is one
 * request. `flush` runs a pending call now; `cancel` drops it (unmount).
 */
export function debounce(fn: () => void, ms: number, timers: {
  set: (f: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
} = {
  set: (f, t) => setTimeout(f, t),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}) {
  let id: unknown = null;
  const run = () => { id = null; fn(); };
  return {
    call() { if (id !== null) timers.clear(id); id = timers.set(run, ms); },
    flush() { if (id !== null) { timers.clear(id); run(); } },
    cancel() { if (id !== null) timers.clear(id); id = null; },
    pending: () => id !== null,
  };
}

/** The bubble's shape, from its neighbours — computed per row in a virtualised list. */
export function bubbleShape<M extends { senderId?: string; authorType?: string; createdAt?: string | null }>(
  list: readonly M[],
  i: number,
  who: (m: M) => string | undefined = (m) => m.senderId,
): { newDay: boolean; grouped: boolean; lastOfGroup: boolean } {
  const m = list[i]!;
  const prev = list[i - 1];
  const next = list[i + 1];
  const day = (x: M) => (x.createdAt ? new Date(x.createdAt).toDateString() : '');
  const newDay = !prev || day(prev) !== day(m);
  return {
    newDay,
    grouped: !!prev && !newDay && who(prev) === who(m),
    lastOfGroup: !next || who(next) !== who(m) || day(next) !== day(m),
  };
}
