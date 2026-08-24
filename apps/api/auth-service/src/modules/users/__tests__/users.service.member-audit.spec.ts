import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Role } from '@hbcfield/shared';

/**
 * Members-area audit regression suite.
 *
 *  M-B1 — a member could PATCH their OWN id with an `enabledModules` Access Profile.
 *         `spaceScope: 'all'` is a server-enforced READ control, so that was a
 *         self-service widening of what they could see. The self-mutation guard
 *         listed every other privilege-bearing field but not this one.
 *
 *  M-B2 — `removeMember` enforced only "not self" and "not the last admin". A
 *         non-admin holding `canManageUsers` could therefore delete the org's
 *         admins one by one — the very thing `updateMemberProfile` refuses.
 */
describe('UsersService members audit (M-B1, M-B2)', () => {
  let service: UsersService;

  const prisma: Record<string, any> = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    accessRole: { findFirst: jest.fn() },
    // The removal history probe counts across 14 tables before deciding hard vs
    // soft delete; each must exist on the mock or the probe throws before we get
    // to assert anything.
    ...Object.fromEntries(
      [
        'task', 'comment', 'attachment', 'taskEvent', 'serviceReport',
        'reportDefinition', 'reportSchedule', 'recurringTaskTemplate', 'invoice',
        'supportTicket', 'message', 'timeEntry', 'overtimeRequest', 'invitation',
        'spaceAssignment', 'technicianSchedule',
      ].map((m) => [m, { count: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() }]),
    ),
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  const orgId = 'org-1';

  describe('M-B1 — enabledModules is privilege-bearing', () => {
    const selfId = 'mgr-1';

    it('refuses a member changing their OWN access profile', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: selfId,
        organizationId: orgId,
        role: Role.EMPLOYEE,
        email: 'mgr@example.com',
      });

      await expect(
        service.updateMemberProfile(selfId, orgId, selfId, {
          enabledModules: { spaceScope: 'all', modules: [] },
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses a non-admin re-scoping an ADMIN', async () => {
      prisma.user.findFirst
        // target member — an admin
        .mockResolvedValueOnce({
          id: 'admin-1',
          organizationId: orgId,
          role: Role.ADMIN,
          email: 'admin@example.com',
        })
        // requester — not an admin
        .mockResolvedValueOnce({ role: Role.EMPLOYEE });

      await expect(
        service.updateMemberProfile('admin-1', orgId, selfId, {
          enabledModules: { spaceScope: 'own', modules: [] },
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('still lets an ADMIN set another member’s access profile', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce({
          id: 'emp-1',
          organizationId: orgId,
          role: Role.EMPLOYEE,
          email: 'emp@example.com',
        })
        .mockResolvedValueOnce({ role: Role.ADMIN }); // requester IS admin
      prisma.user.update.mockResolvedValueOnce({ id: 'emp-1' });

      await service.updateMemberProfile('emp-1', orgId, 'admin-1', {
        enabledModules: { spaceScope: 'all', modules: [] },
      } as any);

      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('M-B2 — removal honours the admin ceiling', () => {
    it('refuses a non-admin removing an ADMIN', async () => {
      prisma.user.findFirst
        // target member — an admin
        .mockResolvedValueOnce({ id: 'admin-1', organizationId: orgId, role: Role.ADMIN })
        // requester — holds canManageUsers but is not an admin
        .mockResolvedValueOnce({ role: Role.EMPLOYEE });

      await expect(
        service.removeMember({
          memberId: 'admin-1',
          organizationId: orgId,
          requesterId: 'mgr-1',
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Never reached the history probe, let alone a delete.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('lets an ADMIN remove another ADMIN while one remains', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce({ id: 'admin-2', organizationId: orgId, role: Role.ADMIN })
        .mockResolvedValueOnce({ role: Role.ADMIN }); // requester IS admin
      prisma.user.count.mockResolvedValueOnce(1); // another active admin remains
      prisma.$transaction
        .mockResolvedValueOnce(new Array(14).fill(0)) // history probe — all clean
        .mockResolvedValueOnce([]); // hard delete

      await expect(
        service.removeMember({
          memberId: 'admin-2',
          organizationId: orgId,
          requesterId: 'admin-1',
        } as any),
      ).resolves.toEqual({ success: true, message: 'Member removed successfully' });
    });

    it('still refuses removing the LAST admin', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce({ id: 'admin-1', organizationId: orgId, role: Role.ADMIN })
        .mockResolvedValueOnce({ role: Role.ADMIN });
      prisma.user.count.mockResolvedValueOnce(0); // no other admin

      await expect(
        service.removeMember({
          memberId: 'admin-1',
          organizationId: orgId,
          requesterId: 'admin-9',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
