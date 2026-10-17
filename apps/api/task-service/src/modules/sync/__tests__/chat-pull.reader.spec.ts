import { decodeCursor } from '../sync-cursor';
import { ChatPullReader, CHAT_DEVICE_DAYS } from '../chat-pull.reader';

/**
 * Chat on the phone, offline: the SAME conversations the online list shows,
 * and only messages of conversations the member is in — changed since the
 * cursor, the last 30 days, files without links, removed words gone.
 */
describe('ChatPullReader', () => {
  const req = { userId: 'mike', organizationId: 'org' };
  const msg = (id: string, at: string, extra: Record<string, unknown> = {}) => ({
    id,
    conversationId: 'c1',
    senderId: 'anna',
    body: 'hello',
    createdAt: new Date(at),
    updatedAt: new Date(at),
    attachments: [
      { fileKey: 'org/chat/c1/a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 5, url: 'https://signed' },
    ],
    ...extra,
  });
  function reader(rows: any[]) {
    const prisma = { message: { findMany: jest.fn(async () => rows) } };
    const chat = { listConversations: jest.fn(async () => ({ data: [{ id: 'c1' }] })) };
    return { r: new ChatPullReader(prisma as any, chat as any), prisma, chat };
  }

  it('conversations are the online list itself, sent whole', async () => {
    const { r, chat } = reader([]);
    const res = await r.conversations(req);
    expect(chat.listConversations).toHaveBeenCalledWith(req);
    expect(res).toMatchObject({ scope: 'chat_conversations', rows: [{ id: 'c1' }], reset: true, hasMore: false });
  });

  it('messages: only conversations the member is in, the last 30 days, oldest change first', async () => {
    const { r, prisma } = reader([]);
    await r.messages(req);
    const args = (prisma.message.findMany.mock.calls[0] as any[])[0];
    expect(args.where.conversation.members).toEqual({ some: { userId: 'mike' } });
    expect(args.where.conversation.OR).toEqual([{ organizationId: 'org' }, { originSpaceId: { not: null } }]);
    expect(Date.now() - args.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(
      CHAT_DEVICE_DAYS * 86_400_000 - 1000,
    );
    expect(args.orderBy).toEqual([{ updatedAt: 'asc' }, { id: 'asc' }]);
  });

  it('files travel without a link; a removed message travels without its words', async () => {
    const { r } = reader([
      msg('m1', '2026-10-15T08:00:00Z'),
      msg('m2', '2026-10-15T08:01:00Z', { deletedAt: new Date(), body: 'secret' }),
    ]);
    const res: any = await r.messages(req);
    expect(res.rows[0].attachments[0]).toEqual({
      fileKey: 'org/chat/c1/a.jpg',
      fileName: 'a.jpg',
      mimeType: 'image/jpeg',
      fileSize: 5,
    });
    expect(res.rows[1].body).toBe('');
    expect(res.rows[1].attachments).toEqual([]);
  });

  it('the cursor resumes after the last row, and an edit moves a message forward again', async () => {
    const { r, prisma } = reader([msg('m1', '2026-10-15T08:00:00Z')]);
    const first: any = await r.messages(req);
    const c = decodeCursor(first.cursor)!;
    expect(c).toMatchObject({ t: '2026-10-15T08:00:00.000Z', i: 'm1' });
    await r.messages({ ...req, cursor: first.cursor });
    const where = (prisma.message.findMany.mock.calls[1] as any[])[0].where;
    expect(where.OR).toEqual([{ updatedAt: { gt: new Date(c.t) } }, { updatedAt: new Date(c.t), id: { gt: 'm1' } }]);
  });
});
