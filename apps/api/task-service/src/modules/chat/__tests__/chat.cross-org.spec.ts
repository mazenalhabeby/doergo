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
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    spaceAssignment: { findMany: jest.fn() },
    spaceShare: { findMany: jest.fn(), findFirst: jest.fn() },
    conversationMember: { findUnique: jest.fn(), update: jest.fn() },
    conversation: { update: jest.fn(), findFirst: jest.fn() },
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
    prisma.spaceAssignment.findMany.mockResolvedValue([{ spaceId: SPACE }]);

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
    prisma.user.findUnique.mockImplementation(({ where }: any) => Promise.resolve(users[where.id] ?? null));
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
    prisma.spaceAssignment.findMany.mockResolvedValue([{ spaceId: SPACE }, { spaceId: 'space-other' }]);
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('closes it when the counterpart account is deactivated', async () => {
    prisma.spaceShare.findMany.mockResolvedValue([activeShare]);
    prisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id === THEM ? { ...users[THEM], isActive: false } : users[where.id]),
    );
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never consults the in-org contact rules for a cross-org thread', async () => {
    prisma.spaceShare.findMany.mockResolvedValue([activeShare]);
    await send();
    // findFirst is the in-org "is this person in my org" lookup — the cross-org
    // path must not fall through to it.
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
