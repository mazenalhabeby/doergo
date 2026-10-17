/**
 * Reading and counting: one rule, the server's total, everywhere.
 *
 * The count stayed after a message was read because a read answered nothing
 * and only some reads announced the total — so a badge that had drifted was
 * never corrected. Now every read returns the caller's true total, ONE helper
 * per app applies it, and a read by me anywhere clears that row everywhere.
 */
import * as fs from 'fs';
import * as path from 'path';
import { applyRead, applyToConversations, type ChatConversation } from '@hbcfield/shared/client';

const conv = (over: Partial<ChatConversation> = {}): ChatConversation => ({
  id: 'c1',
  organizationId: 'o',
  type: 'DIRECT',
  title: null,
  lastMessageAt: null,
  createdAt: '2026-10-16T10:00:00Z',
  unread: 3,
  readAt: {},
  ...over,
});

describe('a read reaches the list', () => {
  it('read by ME (another screen or device): the row is 0 too', () => {
    const [row] = applyRead([conv()], { conversationId: 'c1', userId: 'me', at: '2026-10-16T12:00:00Z' }, 'me');
    expect(row!.unread).toBe(0);
    expect(row!.readAt?.me).toBe('2026-10-16T12:00:00Z');
  });
  it('read by somebody else: only their read time moves, my count stays', () => {
    const [row] = applyRead([conv()], { conversationId: 'c1', userId: 'you', at: '2026-10-16T12:00:00Z' }, 'me');
    expect(row!.unread).toBe(3);
    expect(row!.readAt?.you).toBe('2026-10-16T12:00:00Z');
  });
  it('an older read event never moves the read time back, but mine still clears the count', () => {
    const list = [conv({ readAt: { me: '2026-10-16T13:00:00Z' } })];
    const [row] = applyRead(list, { conversationId: 'c1', userId: 'me', at: '2026-10-16T12:00:00Z' }, 'me');
    expect(row!.readAt?.me).toBe('2026-10-16T13:00:00Z');
    expect(row!.unread).toBe(0);
  });
});

describe('a system line counts for nothing', () => {
  it('"Anna added Karim" neither raises the count nor becomes the preview', () => {
    const list = [conv({ unread: 0 })];
    const out = applyToConversations(
      list,
      {
        conversationId: 'c1',
        message: {
          id: 's1',
          conversationId: 'c1',
          senderId: 'anna',
          kind: 'SYSTEM',
          body: '',
          attachments: [],
          createdAt: '2026-10-16T12:00:00Z',
        },
      },
      { meId: 'me' },
    );
    expect(out.known).toBe(true);
    expect(out.list[0]!.unread).toBe(0);
    expect(out.list[0]!.lastMessage).toBeUndefined();
  });
});

describe('ONE way to mark read, per app', () => {
  const root = path.resolve(__dirname, '../../..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(p);
      return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });
  it('the phone calls chatApi.markRead only inside markConversationRead (which applies the total)', () => {
    const callers = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'app'))]
      .filter((f) => /chatApi\.markRead\(/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(root, f));
    expect(callers).toEqual(['src/lib/chat-badge.ts']);
  });
  it('the web calls chatApi.markRead only inside useMarkRead', () => {
    const web = path.resolve(root, '../web-app/src');
    const callers = walk(web)
      .filter((f) => /chatApi\.markRead\(/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(web, f));
    expect(callers).toEqual(['components/chat/use-chat-live.ts']);
  });
});
