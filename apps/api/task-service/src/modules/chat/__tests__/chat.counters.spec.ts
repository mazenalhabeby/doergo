import { Test } from '@nestjs/testing';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { chatPartsOf, type ChatServiceParts } from './chat.service.fixture';
import { CHAT_PROVIDERS } from '../chat.module';
import { chatStorageStubs } from './chat-storage-stubs';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The list and the badge stopped COUNTING message rows: the send raises each
 * other member's stored count in its transaction, a read zeroes the reader's,
 * and every member is told their own numbers on the socket.
 */
describe('chat unread counters', () => {
  let service: ChatServiceParts;
  let prisma: any;
  let emit: jest.Mock;

  const member = (userId: string, unreadCount = 0) => ({
    userId,
    unreadCount,
    user: {
      id: userId,
      organizationId: 'org',
      role: 'EMPLOYEE',
      isActive: true,
      contactable: true,
      canManageUsers: true,
    },
  });

  beforeEach(async () => {
    emit = jest.fn();
    prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'me',
            role: 'ADMIN',
            organizationId: 'org',
            enabledModules: null,
            contactScope: 'ALL',
            contactAllowedIds: [],
          }),
      },
      message: {
        create: jest.fn((a: any) => ({ id: a.data.id, senderId: 'me', conversationId: 'c1' })),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      conversation: { update: jest.fn(), findMany: jest.fn() },
      conversationMember: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'cm-me',
            unreadCount: 3,
            conversation: {
              id: 'c1',
              type: 'GROUP',
              organizationId: 'org',
              originSpaceId: null,
              members: [member('me'), member('you')],
            },
          }),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { userId: 'me', unreadCount: 0 },
          { userId: 'you', unreadCount: 4 },
        ]),
        groupBy: jest.fn().mockResolvedValue([
          { userId: 'me', _sum: { unreadCount: 1 } },
          { userId: 'you', _sum: { unreadCount: 9 } },
        ]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { unreadCount: 2 } }),
      },
      $transaction: jest.fn(async (ops: any[]) => ops),
    };
    const module = await Test.createTestingModule({
      providers: [
        ...CHAT_PROVIDERS,
        ...chatStorageStubs(),
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit } },
      ],
    }).compile();
    service = chatPartsOf(module);
  });

  it('a send raises everyone else by one, zeroes the sender, and stores the newest message on the thread', async () => {
    await service.sendMessage({ conversationId: 'c1', senderId: 'me', body: 'x'.repeat(200), id: 'm-1' });
    expect(prisma.conversationMember.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'c1', userId: { not: 'me' } },
      data: { unreadCount: { increment: 1 } },
    });
    expect(prisma.conversationMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unreadCount: 0 }) }),
    );
    const conv = prisma.conversation.update.mock.calls[0][0].data;
    expect(conv).toMatchObject({ lastMessageId: 'm-1', lastSenderId: 'me' });
    expect(conv.lastMessagePreview).toHaveLength(140);
  });

  it('a send without a client id still names its message on the thread, in the same transaction', async () => {
    await service.sendMessage({ conversationId: 'c1', senderId: 'me', body: 'hi' });
    const created = prisma.message.create.mock.calls[0][0].data.id;
    expect(created).toEqual(expect.any(String));
    expect(prisma.conversation.update).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.update.mock.calls[0][0].data.lastMessageId).toBe(created);
  });

  it('each member is told their own unread count and total', async () => {
    await service.sendMessage({ conversationId: 'c1', senderId: 'me', body: 'hi', id: 'm-2' });
    const [event, payload] = emit.mock.calls[0];
    expect(event).toBe('chat_message');
    expect(payload.unread).toEqual({ me: 0, you: 4 });
    expect(payload.badge).toEqual({ me: 1, you: 9 });
  });

  it("a read zeroes the count and tells the reader's other screens the new total", async () => {
    await service.markRead({ conversationId: 'c1', userId: 'me' });
    expect(prisma.conversationMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unreadCount: 0 }) }),
    );
    expect(emit).toHaveBeenCalledWith('chat_badge', { userId: 'me', total: 2 });
  });

  it('reading a thread that had nothing unread announces nothing', async () => {
    prisma.conversationMember.findUnique.mockResolvedValueOnce({
      id: 'cm-me',
      unreadCount: 0,
      conversation: { id: 'c1', type: 'GROUP', organizationId: 'org', members: [] },
    });
    await service.markRead({ conversationId: 'c1', userId: 'me' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('every read ANSWERS with the true total — even when nothing was unread — so a drifted badge is corrected', async () => {
    prisma.conversationMember.findUnique.mockResolvedValueOnce({
      id: 'cm-me',
      unreadCount: 0,
      conversation: { id: 'c1', type: 'GROUP', organizationId: 'org', members: [] },
    });
    const res: any = await service.markRead({ conversationId: 'c1', userId: 'me' });
    expect(res).toEqual({ success: true, data: { total: 2 } });
  });

  it('the list reads stored fields only — no message join, no counting', async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        type: 'DIRECT',
        organizationId: 'org',
        originSpaceId: null,
        lastMessageId: 'm-9',
        lastMessagePreview: 'see you',
        lastSenderId: 'you',
        lastMessageAt: new Date('2026-10-15T08:00:00Z'),
        members: [member('me', 5), member('you')],
      },
    ]);
    const res: any = await service.listConversations({ userId: 'me', organizationId: 'org' });
    // Members, and a job chat's job (one row by its unique key) — never messages.
    expect(prisma.conversation.findMany.mock.calls[0][0].include).toEqual({
      members: expect.anything(),
      task: { select: { id: true, title: true, status: true } },
    });
    expect(res.data[0].unread).toBe(5);
    expect(res.data[0].lastMessage).toMatchObject({ id: 'm-9', body: 'see you', senderId: 'you' });
  });

  it("the badge is one sum over the caller's own memberships", async () => {
    const res: any = await service.badge({ userId: 'me' });
    expect(prisma.conversationMember.aggregate).toHaveBeenCalledWith({
      where: { userId: 'me' },
      _sum: { unreadCount: true },
    });
    expect(res.data.total).toBe(2);
  });
});
