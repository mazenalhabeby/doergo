import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { ChatService } from '../chat.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Membership is not permission.
 *
 * Sending only ever checked that you belonged to the conversation, so contact
 * permission was effectively granted forever at the moment it was created:
 * revoke someone's access, or take them out of the space that connected them,
 * and every thread they already had kept working. These cover the re-check.
 */
describe('ChatService.sendMessage — permission is re-checked on every send', () => {
  let service: ChatService;

  const ORG = 'org-1';
  const ME = 'user-me';
  const THEM = 'user-them';

  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    conversationMember: { findUnique: jest.fn(), update: jest.fn() },
    conversation: { update: jest.fn() },
    message: { create: jest.fn() },
    spaceAssignment: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const notificationClient = { emit: jest.fn() };

  /** A member with no manager powers and no contact reach of their own. */
  const plainMember = {
    role: 'EMPLOYEE',
    enabledModules: null,
    contactScope: 'NONE',
    contactAllowedIds: [] as string[],
    canManageUsers: false,
  };

  /**
   * The membership read carries the counterpart's contact fields — sending
   * reuses them instead of fetching the same row again.
   */
  const membership = (type = 'DIRECT', other: any = { id: THEM, organizationId: ORG, role: 'EMPLOYEE', isActive: true, contactable: true, canManageUsers: false }) => ({
    id: 'cm-1',
    conversation: {
      id: 'conv-1',
      type,
      organizationId: ORG,
      originSpaceId: null,
      members: [
        { userId: ME, user: { id: ME, organizationId: ORG, role: 'EMPLOYEE', isActive: true, contactable: true, canManageUsers: false } },
        { userId: THEM, user: other },
      ],
    },
  });

  const send = () =>
    service.sendMessage({ conversationId: 'conv-1', senderId: ME, body: 'hello' });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.conversationMember.findUnique.mockResolvedValue(membership());
    prisma.spaceAssignment.findMany.mockResolvedValue([]); // no shared spaces
    prisma.$transaction.mockImplementation(async () => [{ id: 'msg-1' }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notificationClient },
      ],
    }).compile();
    service = module.get<ChatService>(ChatService);
  });

  it('refuses when contact permission has since been revoked', async () => {
    prisma.user.findUnique.mockResolvedValue(plainMember);

    // contactScope NONE, no space connection, target is not a manager.
    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses once the other person has left the organization', async () => {
    prisma.user.findUnique.mockResolvedValue(plainMember);
    // Their user row now belongs to a different org.
    prisma.conversationMember.findUnique.mockResolvedValue(
      membership('DIRECT', { id: THEM, organizationId: 'org-elsewhere', role: 'EMPLOYEE', isActive: true, contactable: true, canManageUsers: false }),
    );

    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses once the other account is deactivated', async () => {
    prisma.user.findUnique.mockResolvedValue(plainMember);
    prisma.conversationMember.findUnique.mockResolvedValue(
      membership('DIRECT', { id: THEM, organizationId: ORG, role: 'EMPLOYEE', isActive: false, contactable: true, canManageUsers: false }),
    );

    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses when the target became non-contactable', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...plainMember, contactScope: 'ALL' });
    prisma.conversationMember.findUnique.mockResolvedValue(
      membership('DIRECT', { id: THEM, organizationId: ORG, role: 'EMPLOYEE', isActive: true, contactable: false, canManageUsers: false }),
    );

    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still allows a send that is genuinely permitted', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...plainMember, contactScope: 'ALL' });

    await expect(send()).resolves.toEqual({ success: true, data: { id: 'msg-1' } });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('does not make an admin pay for the space lookup', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...plainMember, role: 'ADMIN' });

    await expect(send()).resolves.toMatchObject({ success: true });
    // The rule settles on "is a manager" long before space targets matter.
    expect(prisma.spaceAssignment.findMany).not.toHaveBeenCalled();
  });

  it('leaves GROUP threads to membership — there is no pair to evaluate', async () => {
    prisma.conversationMember.findUnique.mockResolvedValue(membership('GROUP'));

    await expect(send()).resolves.toMatchObject({ success: true });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('denies a malformed direct thread with no counterpart', async () => {
    prisma.conversationMember.findUnique.mockResolvedValue({
      id: 'cm-1',
      conversation: { id: 'conv-1', type: 'DIRECT', organizationId: ORG, originSpaceId: null, members: [{ userId: ME }] },
    });

    await expect(send()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
