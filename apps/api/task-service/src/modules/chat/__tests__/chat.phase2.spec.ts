import { Test } from '@nestjs/testing';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { chatPartsOf, type ChatServiceParts } from './chat.service.fixture';
import { ChatEditService } from '../chat-edit.service';
import { CHAT_PROVIDERS } from '../chat.module';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { chatStorageStubs, fakeObjectStore } from './chat-storage-stubs';

/**
 * Phase 2 of chat on the server: files only by OUR key, older history by
 * (createdAt, id), your own message changeable for 15 minutes, mute, read events.
 */
describe('chat phase 2', () => {
  const conv = {
    id: 'c1',
    type: 'GROUP',
    organizationId: 'org',
    originSpaceId: null,
    members: [
      { userId: 'me', user: { isActive: true } },
      { userId: 'you', user: { isActive: true } },
    ],
  };
  let chat: ChatServiceParts;
  let edits: ChatEditService;
  let prisma: any;
  let store: ReturnType<typeof fakeObjectStore>;
  let emit: jest.Mock;

  beforeEach(async () => {
    emit = jest.fn();
    store = fakeObjectStore();
    prisma = {
      conversationMember: {
        findUnique: jest.fn(async () => ({ id: 'cm', unreadCount: 2, conversation: conv })),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(async () => []),
        groupBy: jest.fn(async () => []),
        aggregate: jest.fn(async () => ({ _sum: { unreadCount: 0 } })),
      },
      message: {
        findUnique: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        create: jest.fn((a: any) => ({ ...a.data, sender: null })),
        update: jest.fn((a: any) => ({ id: a.where.id, conversationId: 'c1', ...a.data })),
      },
      conversation: { update: jest.fn(), updateMany: jest.fn() },
      user: { findUnique: jest.fn(async () => ({ enabledModules: null })) },
      $transaction: jest.fn(async (ops: any[]) => ops),
    };
    const m = await Test.createTestingModule({
      providers: [
        ...CHAT_PROVIDERS,
        ...chatStorageStubs(store),
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit } },
      ],
    }).compile();
    chat = chatPartsOf(m);
    edits = m.get(ChatEditService);
  });

  describe('files', () => {
    const file = (key: string, mimeType = 'image/jpeg') => ({ fileKey: key, fileName: 'a.jpg', mimeType });

    it('a message may be only files; each is signed for the readers, never stored as a link', async () => {
      const res: any = await chat.sendMessage({
        conversationId: 'c1',
        senderId: 'me',
        body: '',
        attachments: [file('org/chat/c1/x.jpg')],
      });
      const stored = prisma.message.create.mock.calls[0][0].data.attachments;
      expect(stored[0]).toEqual({
        fileKey: 'org/chat/c1/x.jpg',
        fileName: 'a.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        width: null,
        height: null,
      });
      expect(res.data.attachments[0].url).toBe('signed:org/chat/c1/x.jpg');
      expect(prisma.conversation.update.mock.calls[0][0].data.lastMessagePreview).toBe('a.jpg');
    });

    it('refuses a key from another conversation or organization', async () => {
      await expect(
        chat.sendMessage({
          conversationId: 'c1',
          senderId: 'me',
          body: 'x',
          attachments: [file('org/chat/OTHER/x.jpg')],
        }),
      ).rejects.toThrow(/not one of its uploads/);
      await expect(
        chat.sendMessage({
          conversationId: 'c1',
          senderId: 'me',
          body: 'x',
          attachments: [file('evil/chat/c1/x.jpg')],
        }),
      ).rejects.toThrow(/not one of its uploads/);
    });

    it('refuses a key that was never uploaded, or an empty one', async () => {
      store.head.mockResolvedValueOnce({ exists: false, sizeBytes: 0 });
      await expect(
        chat.sendMessage({ conversationId: 'c1', senderId: 'me', body: 'x', attachments: [file('org/chat/c1/x.jpg')] }),
      ).rejects.toThrow(/not uploaded/);
    });

    it('refuses a type chat does not take, and a message with neither words nor files', async () => {
      await expect(
        chat.sendMessage({
          conversationId: 'c1',
          senderId: 'me',
          body: 'x',
          attachments: [file('org/chat/c1/x.exe', 'application/x-msdownload')],
        }),
      ).rejects.toThrow();
      await expect(chat.sendMessage({ conversationId: 'c1', senderId: 'me', body: '   ' })).rejects.toThrow(
        /words or a file/,
      );
    });

    it('an upload link is a key under this conversation', async () => {
      const res: any = await chat.presignAttachment({
        conversationId: 'c1',
        userId: 'me',
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
      });
      expect(res.data.fileKey).toMatch(/^org\/chat\/c1\/[\w-]+\.pdf$/);
    });
  });

  it('older history is paged by (createdAt, id) and a removed message has no words', async () => {
    prisma.message.findMany.mockResolvedValueOnce([{ id: 'm2', body: 'gone', deletedAt: new Date(), attachments: [] }]);
    const res: any = await chat.history({ conversationId: 'c1', userId: 'me', before: '2026-10-15T08:00:00.000Z|m9' });
    const args = prisma.message.findMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { createdAt: { lt: new Date('2026-10-15T08:00:00.000Z') } },
      { createdAt: new Date('2026-10-15T08:00:00.000Z'), id: { lt: 'm9' } },
    ]);
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(res.data[0].body).toBe('');
  });

  describe('edit and remove', () => {
    const own = (minutesAgo: number, extra = {}) => ({
      id: 'm1',
      conversationId: 'c1',
      senderId: 'me',
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
      deletedAt: null,
      ...extra,
    });

    it('your own message, inside 15 minutes: changed, and every member is told', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(own(5));
      await edits.edit({ messageId: 'm1', userId: 'me', body: 'fixed' });
      expect(prisma.message.update.mock.calls[0][0].data).toMatchObject({ body: 'fixed', editedAt: expect.any(Date) });
      expect(emit).toHaveBeenCalledWith(
        'chat_message_changed',
        expect.objectContaining({ conversationId: 'c1', memberIds: ['me', 'you'] }),
      );
    });

    it('after 15 minutes: refused', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(own(16));
      await expect(edits.edit({ messageId: 'm1', userId: 'me', body: 'late' })).rejects.toThrow(/15 minutes/);
    });

    it("somebody else's message reads as not found", async () => {
      prisma.message.findUnique.mockResolvedValueOnce(own(1, { senderId: 'you' }));
      await expect(edits.remove({ messageId: 'm1', userId: 'me' })).rejects.toThrow(/not found/i);
    });

    it('a removal drops the words and the files, and the list row if it was the newest', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(own(1));
      await edits.remove({ messageId: 'm1', userId: 'me' });
      expect(prisma.message.update.mock.calls[0][0].data).toMatchObject({
        body: '',
        attachments: [],
        deletedAt: expect.any(Date),
      });
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', lastMessageId: 'm1' },
        data: { lastMessagePreview: '' },
      });
    });
  });

  it('mute: until a future moment, or off; never the past', async () => {
    const until = new Date(Date.now() + 3600_000).toISOString();
    await chat.mute({ conversationId: 'c1', userId: 'me', until });
    expect(prisma.conversationMember.update.mock.calls[0][0].data.mutedUntil.toISOString()).toBe(until);
    await chat.mute({ conversationId: 'c1', userId: 'me', until: null });
    expect(prisma.conversationMember.update.mock.calls[1][0].data.mutedUntil).toBeNull();
    await expect(chat.mute({ conversationId: 'c1', userId: 'me', until: '2020-01-01T00:00:00Z' })).rejects.toThrow(
      /future/,
    );
  });

  it('reading what was unread tells the others (for "Read") and the reader\'s screens (badge)', async () => {
    await chat.markRead({ conversationId: 'c1', userId: 'me' });
    const events = emit.mock.calls.map((c) => c[0]);
    expect(events).toEqual(['chat_badge', 'chat_read']);
    expect(emit.mock.calls[1][1]).toMatchObject({ conversationId: 'c1', userId: 'me', memberIds: ['me', 'you'] });
  });
});
