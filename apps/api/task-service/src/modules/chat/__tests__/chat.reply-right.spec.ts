import { chatPartsOf, type ChatServiceParts } from './chat.service.fixture';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { CONVERSATION_LIST_ORDER } from '../chat.service';
import { CHAT_PROVIDERS } from '../chat.module';
import { chatStorageStubs } from './chat-storage-stubs';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The reply right.
 *
 * Reach is directional: a manager reaches anyone, a member restricted to their
 * own leads (contactScope SELECTED/NONE) reaches only those. That is right for
 * STARTING a conversation, and it was also asked of every reply — so Mike
 * received Karim's message and got 403 answering it. Somebody written to in a
 * direct thread may answer, as long as the writer could STILL reach them now
 * and both are still in chat. Re-asked on every send, never granted by history.
 */
describe('ChatService.sendMessage — the reply right', () => {
  let service: ChatServiceParts;

  const ORG = 'org-1';
  const MIKE = 'emp-mike';
  const KARIM = 'emp-karim';

  /** Mike: restricted to an empty allow-list and no space leads. */
  const mike = {
    id: MIKE, organizationId: ORG, isActive: true, contactable: true,
    role: 'EMPLOYEE', canManageUsers: false, memberRole: null,
    enabledModules: null, contactScope: 'SELECTED', contactAllowedIds: [] as string[],
  };
  /** Karim: a manager — reaches anyone in chat. */
  const karim = { ...mike, id: KARIM, canManageUsers: true, contactScope: 'NONE' };

  let rows: Record<string, any>;
  const prisma: any = {
    user: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(rows[where.id] ?? null)),
      findFirst: jest.fn(({ where }: any) => Promise.resolve(rows[where.id]?.organizationId === where.organizationId ? rows[where.id] : null)),
    },
    conversationMember: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
    },
    conversation: { update: jest.fn() },
    message: { create: jest.fn(), findFirst: jest.fn() },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async () => [{ id: 'msg-1' }]),
  };

  const membership = () => ({
    id: 'cm-mike',
    conversation: {
      id: 'conv-1',
      type: 'DIRECT',
      organizationId: ORG,
      originSpaceId: null,
      members: [
        { userId: MIKE, user: { id: MIKE, organizationId: ORG, role: 'EMPLOYEE', isActive: true, contactable: rows[MIKE].contactable, canManageUsers: false } },
        { userId: KARIM, user: { id: KARIM, organizationId: ORG, role: 'EMPLOYEE', isActive: rows[KARIM].isActive, contactable: rows[KARIM].contactable, canManageUsers: rows[KARIM].canManageUsers } },
      ],
    },
  });

  const reply = () => service.sendMessage({ conversationId: 'conv-1', senderId: MIKE, body: 'thanks' });

  beforeEach(async () => {
    jest.clearAllMocks();
    rows = { [MIKE]: { ...mike }, [KARIM]: { ...karim } };
    prisma.conversationMember.findUnique.mockImplementation(() => Promise.resolve(membership()));
    prisma.message.findFirst.mockResolvedValue({ id: 'karim-wrote' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...CHAT_PROVIDERS,
        ...chatStorageStubs(),
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = chatPartsOf(module);
  });

  it('a member written to by a manager may answer, although they could not have started it', async () => {
    await expect(reply()).resolves.toEqual({ success: true, data: { id: 'msg-1' } });
    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: 'conv-1', senderId: KARIM } }),
    );
  });

  it('…but not before the other person has written anything into the thread', async () => {
    prisma.message.findFirst.mockResolvedValue(null);
    await expect(reply()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('the right follows the writer\'s CURRENT reach: demote them and it goes', async () => {
    rows[KARIM] = { ...karim, canManageUsers: false, contactScope: 'NONE' };
    await expect(reply()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the writer taken out of chat (Messaging off) ends it', async () => {
    rows[KARIM] = { ...karim, enabledModules: { canContact: false } };
    await expect(reply()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the writer made non-contactable ends it', async () => {
    rows[KARIM] = { ...karim, contactable: false };
    await expect(reply()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the replier taken out of chat (their own switch off) cannot answer', async () => {
    rows[MIKE] = { ...mike, enabledModules: { canContact: false } };
    await expect(reply()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the writer deactivated ends it', async () => {
    rows[KARIM] = { ...karim, isActive: false };
    await expect(reply()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('a send that is permitted on its own never pays for the reply lookup', async () => {
    rows[MIKE] = { ...mike, contactScope: 'ALL' };
    await expect(reply()).resolves.toMatchObject({ success: true });
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });
});

describe('conversation list order', () => {
  it('newest message first, threads with no message at the bottom (nulls last), then newest opened', () => {
    expect(CONVERSATION_LIST_ORDER).toEqual([
      { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ]);
  });

  it('listConversations asks the database for that order', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...CHAT_PROVIDERS,
        ...chatStorageStubs(),
        { provide: PrismaService, useValue: { conversation: { findMany } } },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    await chatPartsOf(module).listConversations({ userId: 'u', organizationId: 'o' });
    expect(findMany.mock.calls[0][0].orderBy).toBe(CONVERSATION_LIST_ORDER);
  });
});
