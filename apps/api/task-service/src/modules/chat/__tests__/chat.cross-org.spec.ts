import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { ChatService } from '../chat.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Cross-org conversations are authorized by a share, and the share is checked
 * again on every send. These cover the requirement that matters most: when the
 * space stops being shared, two people who have been talking must not be able
 * to keep talking — while what they already said stays readable.
 */
describe('ChatService — cross-org conversations', () => {
  let service: ChatService;

  const OWNER_ORG = 'org-owner';
  const GUEST_ORG = 'org-guest';
  const SPACE = 'space-shared';
  const ME = 'user-owner-side';
  const THEM = 'user-guest-side';

  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    spaceAssignment: { findMany: jest.fn() },
    spaceShare: { findMany: jest.fn(), findFirst: jest.fn() },
    conversationMember: { findUnique: jest.fn(), update: jest.fn() },
    conversation: { update: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    message: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const notificationClient = { emit: jest.fn() };

  const users: Record<string, any> = {
    [ME]: { id: ME, organizationId: OWNER_ORG, role: 'EMPLOYEE', isActive: true },
    [THEM]: { id: THEM, organizationId: GUEST_ORG, role: 'EMPLOYEE', isActive: true },
  };

  const activeShare = {
    spaceId: SPACE,
    ownerOrgId: OWNER_ORG,
    guestOrgId: GUEST_ORG,
    status: 'ACTIVE',
    showWorkers: true,
    expiresAt: null,
  };

  /** Both people are assigned to the shared space. */
  const bothOnSpace = () =>
    prisma.spaceAssignment.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve((where.userId?.in ?? [where.userId]).flatMap((id: string) => [{ userId: id, spaceId: SPACE }])),
    );

  const crossOrgMembership = () => ({
    id: 'cm-1',
    conversation: {
      id: 'conv-1',
      type: 'DIRECT',
      organizationId: OWNER_ORG,
      originSpaceId: SPACE, // anchored to the share that authorized it
      members: [{ userId: ME }, { userId: THEM }],
    },
  });

  const send = () => service.sendMessage({ conversationId: 'conv-1', senderId: ME, body: 'hi' });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Both parties come back in ONE query now.
    prisma.user.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        (where.id.in as string[])
          .map((id) => users[id])
          .filter((u) => u && (where.isActive === undefined || u.isActive === where.isActive)),
      ),
    );
    prisma.conversationMember.findUnique.mockResolvedValue(crossOrgMembership());
    prisma.$transaction.mockImplementation(async () => [{ id: 'msg-1' }]);
    bothOnSpace();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notificationClient },
      ],
    }).compile();
    service = module.get<ChatService>(ChatService);
  });

  it('lets two people on an actively shared space message each other', async () => {
    prisma.spaceShare.findMany.mockResolvedValue([activeShare]);
    await expect(send()).resolves.toMatchObject({ success: true });
  });

  it('closes the conversation when the space stops being shared', async () => {
    // The requirement, exactly: the share is gone, the history exists, and they
    // must not be able to carry on.
    prisma.spaceShare.findMany.mockResolvedValue([]); // revoked shares aren't returned
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('closes it when the owner stops exposing workers', async () => {
    prisma.spaceShare.findMany.mockResolvedValue([]); // showWorkers:false is filtered at the query
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('closes it when the share has expired', async () => {
    prisma.spaceShare.findMany.mockResolvedValue([{ ...activeShare, expiresAt: new Date('2020-01-01') }]);
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('closes it when someone is taken off the space', async () => {
    prisma.spaceShare.findMany.mockResolvedValue([activeShare]);
    prisma.spaceAssignment.findMany.mockResolvedValue([]); // neither is on it any more
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not stay open on the strength of a different shared space', async () => {
    // A live share elsewhere between the same orgs must not resurrect a thread
    // whose own reason has gone.
    prisma.spaceShare.findMany.mockResolvedValue([{ ...activeShare, spaceId: 'space-other' }]);
    prisma.spaceAssignment.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        (where.userId?.in ?? [where.userId]).flatMap((id: string) => [
          { userId: id, spaceId: SPACE },
          { userId: id, spaceId: 'space-other' },
        ]),
      ),
    );
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('closes it when the counterpart account is deactivated', async () => {
    prisma.spaceShare.findMany.mockResolvedValue([activeShare]);
    // The deactivated account simply doesn't come back from the batched read.
    prisma.user.findMany.mockResolvedValue([users[ME]]);
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never consults the in-org contact rules for a cross-org thread', async () => {
    prisma.spaceShare.findMany.mockResolvedValue([activeShare]);
    await send();
    // findFirst is the in-org "is this person in my org" lookup — the cross-org
    // path must not fall through to it.
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

/**
 * The list has to say which cross-org threads have stopped accepting messages,
 * or a closed one looks ordinary until you type into it and get bounced.
 */
describe('ChatService.listConversations — closed threads are reported', () => {
  let service: ChatService;

  const OWNER_ORG = 'org-owner';
  const GUEST_ORG = 'org-guest';
  const SPACE = 'space-shared';
  const ME = 'user-owner-side';
  const THEM = 'user-guest-side';

  const users: Record<string, any> = {
    [ME]: { id: ME, organizationId: OWNER_ORG, role: 'EMPLOYEE', isActive: true },
    [THEM]: { id: THEM, organizationId: GUEST_ORG, role: 'EMPLOYEE', isActive: true },
  };

  const prisma: any = {
    conversation: { findMany: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    spaceAssignment: { findMany: jest.fn() },
    spaceShare: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };

  const row = (id: string, originSpaceId: string | null) => ({
    id,
    organizationId: OWNER_ORG,
    type: 'DIRECT',
    title: null,
    originSpaceId,
    lastMessageAt: null,
    createdAt: new Date(),
    members: [
      { userId: ME, user: { id: ME } },
      { userId: THEM, user: { id: THEM } },
    ],
    messages: [],
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.user.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve((where.id.in as string[]).map((id) => users[id]).filter(Boolean)),
    );
    prisma.spaceAssignment.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve((where.userId?.in ?? [where.userId]).map((id: string) => ({ userId: id, spaceId: SPACE }))),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(ChatService);
  });

  const list = () => service.listConversations({ userId: ME, organizationId: OWNER_ORG });

  it('reports a cross-org thread as open while its share lives', async () => {
    prisma.conversation.findMany.mockResolvedValue([row('c1', SPACE)]);
    prisma.spaceShare.findMany.mockResolvedValue([
      { spaceId: SPACE, ownerOrgId: OWNER_ORG, guestOrgId: GUEST_ORG, status: 'ACTIVE', showWorkers: true, expiresAt: null },
    ]);
    const res: any = await list();
    expect(res.data[0]).toMatchObject({ isExternal: true, isClosed: false });
  });

  it('reports it closed once the space is no longer shared', async () => {
    prisma.conversation.findMany.mockResolvedValue([row('c1', SPACE)]);
    prisma.spaceShare.findMany.mockResolvedValue([]);
    const res: any = await list();
    expect(res.data[0]).toMatchObject({ isExternal: true, isClosed: true });
  });

  it('never marks an in-org thread closed', async () => {
    prisma.conversation.findMany.mockResolvedValue([row('c1', null)]);
    const res: any = await list();
    expect(res.data[0]).toMatchObject({ isExternal: false, isClosed: false });
  });

  it('costs nothing extra when there are no cross-org threads', async () => {
    prisma.conversation.findMany.mockResolvedValue([row('c1', null)]);
    await list();
    // The overwhelming majority of people: no share lookup, no party lookup.
    expect(prisma.spaceShare.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('resolves a whole list of cross-org threads in one pass', async () => {
    prisma.conversation.findMany.mockResolvedValue([row('c1', SPACE), row('c2', SPACE), row('c3', SPACE)]);
    prisma.spaceShare.findMany.mockResolvedValue([
      { spaceId: SPACE, ownerOrgId: OWNER_ORG, guestOrgId: GUEST_ORG, status: 'ACTIVE', showWorkers: true, expiresAt: null },
    ]);
    await list();
    // Two queries for the whole list, not two per thread.
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.spaceShare.findMany).toHaveBeenCalledTimes(1);
  });
});
