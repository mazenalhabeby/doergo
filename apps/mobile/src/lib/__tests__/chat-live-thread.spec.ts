/**
 * A message on the socket is ADDED to what the screen holds, not reloaded —
 * chat and support (components/chat/live-thread.ts).
 */
import * as fs from 'fs';
import * as path from 'path';
import { appendMessage, applyToConversations, bubbleShape, debounce, isPlaceable, markReadLocally } from '../../components/chat/live-thread';

const msg = (id: string, at: string, senderId = 'karim', conversationId = 'c1') =>
  ({ id, conversationId, senderId, body: id, attachments: [], createdAt: at });
const conv = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, organizationId: 'o', type: 'DIRECT', title: null, lastMessageAt: null, createdAt: '2026-10-01T00:00:00Z', unread: 0, ...extra }) as never;

describe('appending a message to a thread', () => {
  const thread = [msg('a', '2026-10-10T08:00:00Z'), msg('b', '2026-10-10T08:01:00Z')];

  it('goes to the end when it is the newest — without touching the rest', () => {
    const next = appendMessage(thread, msg('c', '2026-10-10T08:02:00Z'));
    expect(next.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(next[0]).toBe(thread[0]);
    expect(thread).toHaveLength(2);
  });

  it('the same id twice is ONE message (the socket echoes my own send) — the server copy wins', () => {
    const once = appendMessage(thread, msg('c', '2026-10-10T08:02:00Z'));
    const twice = appendMessage(once, { ...msg('c', '2026-10-10T08:02:00Z'), body: 'server' });
    expect(twice.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(twice[2]!.body).toBe('server');
  });

  it('a late message (sent from offline) lands in time order, not at the end', () => {
    const next = appendMessage(thread, msg('early', '2026-10-10T08:00:30Z'));
    expect(next.map((m) => m.id)).toEqual(['a', 'early', 'b']);
  });

  it('a payload with no id cannot be placed — the caller reloads instead', () => {
    expect(isPlaceable(undefined)).toBe(false);
    expect(isPlaceable({ body: 'x' })).toBe(false);
    expect(isPlaceable(msg('x', '2026-10-10T08:00:00Z'))).toBe(true);
  });
});

describe('the conversation list after a message', () => {
  const list = [conv('c0'), conv('c1', { unread: 2 }), conv('c2')];

  it('moves the conversation to the top with the message and counts it unread', () => {
    const r = applyToConversations(list, { conversationId: 'c1', message: msg('m', '2026-10-10T09:00:00Z') }, { meId: 'mike', openId: null });
    expect(r.known).toBe(true);
    expect(r.list.map((c) => c.id)).toEqual(['c1', 'c0', 'c2']);
    expect(r.list[0]!.unread).toBe(3);
    expect(r.list[0]!.lastMessage!.id).toBe('m');
    expect(r.list[0]!.lastMessageAt).toBe('2026-10-10T09:00:00Z');
  });

  it('my own message and the open thread are not unread', () => {
    const mine = applyToConversations(list, { conversationId: 'c1', message: msg('m', '2026-10-10T09:00:00Z', 'mike') }, { meId: 'mike' });
    expect(mine.list[0]!.unread).toBe(2);
    const open = applyToConversations(list, { conversationId: 'c1', message: msg('m', '2026-10-10T09:00:00Z') }, { meId: 'mike', openId: 'c1' });
    expect(open.list[0]!.unread).toBe(0);
  });

  it('the same message twice is counted once', () => {
    const once = applyToConversations(list, { conversationId: 'c1', message: msg('m', '2026-10-10T09:00:00Z') }, { meId: 'mike' }).list;
    const twice = applyToConversations(once, { conversationId: 'c1', message: msg('m', '2026-10-10T09:00:00Z') }, { meId: 'mike' }).list;
    expect(twice[0]!.unread).toBe(3);
  });

  it('a conversation this phone never listed is NOT known — only a reload can draw it', () => {
    const r = applyToConversations(list, { conversationId: 'new', message: msg('m', '2026-10-10T09:00:00Z', 'karim', 'new') }, { meId: 'mike' });
    expect(r.known).toBe(false);
    expect(r.list).toBe(list);
  });

  it('reading clears the count on the phone, without asking for the list again', () => {
    const r = markReadLocally(list, 'c1');
    expect(r[1]!.unread).toBe(0);
    expect(markReadLocally(r, 'c1')).toBe(r);
  });
});

describe('a burst of socket events is one request', () => {
  it('calls once, after the last call', () => {
    jest.useFakeTimers();
    const fn = jest.fn();
    const d = debounce(fn, 1000);
    d.call(); jest.advanceTimersByTime(500);
    d.call(); jest.advanceTimersByTime(500);
    d.call();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    d.call(); d.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    d.call(); d.cancel(); jest.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});

describe('bubble shape from neighbours', () => {
  it('groups one sender\'s run inside a day; a new day starts a new group', () => {
    const list = [
      msg('a', '2026-10-09T10:00:00Z', 'k'), msg('b', '2026-10-10T10:00:00Z', 'k'),
      msg('c', '2026-10-10T10:01:00Z', 'k'), msg('d', '2026-10-10T10:02:00Z', 'm'),
    ];
    expect(bubbleShape(list, 0)).toEqual({ newDay: true, grouped: false, lastOfGroup: true });
    expect(bubbleShape(list, 1)).toEqual({ newDay: true, grouped: false, lastOfGroup: false });
    expect(bubbleShape(list, 2)).toEqual({ newDay: false, grouped: true, lastOfGroup: true });
    expect(bubbleShape(list, 3)).toEqual({ newDay: false, grouped: false, lastOfGroup: true });
  });
});

describe('the screens use it', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  it.each(['src/components/chat/chat-screen.tsx', 'app/(app)/support.tsx'])('%s: a virtualised, inverted thread and no reload per message', (f) => {
    const src = read(f);
    expect(src).toMatch(/<FlatList[\s\S]*?\binverted\b/);
    expect(src).not.toMatch(/<ScrollView\b/);
    expect(src).toMatch(/appendMessage\(/);
  });
});
