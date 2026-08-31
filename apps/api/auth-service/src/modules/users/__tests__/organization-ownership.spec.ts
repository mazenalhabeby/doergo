import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Ownership of an organization.
 *
 * Before this, any admin could delete any other admin — the founder included, by
 * somebody they had invited that morning. The only floor was the last-admin
 * check, which fires when ONE admin remains; with two, each could delete the
 * other and the survivor took the organization.
 *
 * So the owner cannot be removed or demoted, and the only way out is a
 * deliberate handover by the owner themselves. That last part is what makes it a
 * rule rather than a trap, and why the transfer is guarded on ownership rather
 * than on a permission: an admin who could TAKE ownership could then remove the
 * founder, which is precisely the outcome being prevented.
 */
describe('organization ownership', () => {
  let service: UsersService;

  const prisma: Record<string, any> = {
    organization: { findUnique: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };

  const ORG = 'org-1';
  const OWNER = 'owner-1';
  const OTHER_ADMIN = 'admin-2';

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: 'TASK_SERVICE', useValue: { emit: jest.fn() } },
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('transferOwnership', () => {
    it('refuses an admin who is not the owner', async () => {
      // The whole point: ownership is not delegable by holding a permission.
      prisma.organization.findUnique.mockResolvedValue({ ownerId: OWNER });

      const r: any = await service.transferOwnership({
        organizationId: ORG, requesterId: OTHER_ADMIN, newOwnerId: OTHER_ADMIN,
      });
      expect(r.success).toBe(false);
      expect(r.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a target from another organization', async () => {
      prisma.organization.findUnique.mockResolvedValue({ ownerId: OWNER });
      prisma.user.findFirst.mockResolvedValue(null); // scoped lookup finds nobody

      const r: any = await service.transferOwnership({
        organizationId: ORG, requesterId: OWNER, newOwnerId: 'someone-elsewhere',
      });
      expect(r.success).toBe(false);
      expect(r.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('scopes the target lookup to the organization and to active members', async () => {
      prisma.organization.findUnique.mockResolvedValue({ ownerId: OWNER });
      prisma.user.findFirst.mockResolvedValue(null);
      await service.transferOwnership({ organizationId: ORG, requesterId: OWNER, newOwnerId: 'x' });

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, isActive: true }) }),
      );
    });

    it('makes the new owner an admin in the SAME transaction', async () => {
      /*
        An owner who is not an admin is the lockout this feature exists to
        prevent, and a half-applied transfer is how you arrive there.
      */
      prisma.organization.findUnique.mockResolvedValue({ ownerId: OWNER });
      prisma.user.findFirst.mockResolvedValue({ id: OTHER_ADMIN, role: 'EMPLOYEE', firstName: 'A', lastName: 'B' });

      const r: any = await service.transferOwnership({
        organizationId: ORG, requesterId: OWNER, newOwnerId: OTHER_ADMIN,
      });
      expect(r.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: 'ADMIN' } }),
      );
    });

    it('refuses transferring to the current owner', async () => {
      prisma.organization.findUnique.mockResolvedValue({ ownerId: OWNER });
      const r: any = await service.transferOwnership({
        organizationId: ORG, requesterId: OWNER, newOwnerId: OWNER,
      });
      expect(r.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('lets an admin claim an organization that has no owner recorded', async () => {
      // Orgs created before ownership existed must not be permanently ownerless.
      prisma.organization.findUnique.mockResolvedValue({ ownerId: null });
      prisma.user.findFirst
        .mockResolvedValueOnce({ id: OTHER_ADMIN, role: 'ADMIN', firstName: 'A', lastName: 'B' }) // target
        .mockResolvedValueOnce({ id: 'claimer' }); // requester is an admin

      const r: any = await service.transferOwnership({
        organizationId: ORG, requesterId: 'claimer', newOwnerId: OTHER_ADMIN,
      });
      expect(r.success).toBe(true);
    });
  });

  describe('removeMember', () => {
    it('refuses to remove the owner', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: OWNER, role: 'ADMIN', organizationId: ORG });
      prisma.organization.findUnique.mockResolvedValue({ ownerId: OWNER });

      await expect(
        service.removeMember({ memberId: OWNER, organizationId: ORG, requesterId: OTHER_ADMIN }),
      ).rejects.toThrow(/owner cannot be removed/i);
    });
  });
});
