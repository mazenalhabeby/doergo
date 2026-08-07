import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Role, permissionsExceed } from '@hbcfield/shared';

/**
 * C1 regression suite — the memberRoleId privilege-escalation hole.
 * A non-admin `canManageUsers` holder must not be able to point a member (or
 * themselves) at a role that grants more than they hold, nor author such a role.
 */
describe('UsersService access ceiling (C1)', () => {
  let service: UsersService;

  const prisma: Record<string, any> = {
    user: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
    accessRole: { findFirst: jest.fn(), aggregate: jest.fn(), create: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('permissionsExceed (pure)', () => {
    it('flags a target that grants a key the requester lacks', () => {
      expect(permissionsExceed({ canViewAllTasks: true }, { canManageUsers: true })).toBe(true);
    });
    it('passes a target within the requester ceiling', () => {
      expect(
        permissionsExceed(
          { canManageUsers: true, canViewAllTasks: true },
          { canViewAllTasks: true },
        ),
      ).toBe(false);
    });
  });

  describe('updateMemberProfile', () => {
    const orgId = 'org-1';
    const requesterId = 'req-1';
    const memberId = 'mem-1';

    it('blocks a non-admin from assigning a role that exceeds their ceiling', async () => {
      // target member exists in org
      prisma.user.findFirst
        .mockResolvedValueOnce({ id: memberId, organizationId: orgId, role: Role.EMPLOYEE }) // member lookup
        .mockResolvedValueOnce({
          role: Role.EMPLOYEE, // requester is NOT admin
          canManageUsers: true,
          canViewAllTasks: true,
          memberRole: null,
        }); // requester ceiling lookup
      // memberRoleId validity lookup → an admin-grade role
      prisma.accessRole.findFirst
        .mockResolvedValueOnce({ id: 'admin-role' }) // valid ORG role
        .mockResolvedValueOnce({ permissions: { canManageUsers: true, canAssignTasks: true, canViewAllTasks: true } }); // target perms

      await expect(
        service.updateMemberProfile(memberId, orgId, requesterId, {
          memberRoleId: 'admin-role',
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks a self memberRoleId edit outright', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: requesterId,
        organizationId: orgId,
        role: Role.EMPLOYEE,
      });
      await expect(
        service.updateMemberProfile(requesterId, orgId, requesterId, {
          memberRoleId: 'any-role',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows an admin to assign any role', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce({ id: memberId, organizationId: orgId, role: Role.EMPLOYEE }) // member
        .mockResolvedValueOnce({ role: Role.ADMIN, memberRole: null }); // requester is admin
      prisma.accessRole.findFirst.mockResolvedValueOnce({ id: 'admin-role' }); // valid role
      prisma.user.update.mockResolvedValueOnce({ id: memberId, memberRoleId: 'admin-role' });

      const res = await service.updateMemberProfile(memberId, orgId, requesterId, {
        memberRoleId: 'admin-role',
      } as any);
      expect(res.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('createAccessRole capping', () => {
    it('strips permissions beyond a non-admin creator ceiling', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        role: Role.EMPLOYEE,
        canManageUsers: true, // only this
        memberRole: null,
      });
      prisma.accessRole.aggregate.mockResolvedValueOnce({ _max: { position: 0 } });
      prisma.accessRole.findFirst.mockResolvedValueOnce(null); // uniqueRoleSlug: no clash
      prisma.accessRole.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'r1', ...data }),
      );

      await service.createAccessRole({
        organizationId: 'org-1',
        requesterId: 'req-1',
        name: 'Sneaky',
        permissions: { canManageUsers: true, canAssignTasks: true, canViewReports: true },
      });

      const created = prisma.accessRole.create.mock.calls[0][0].data.permissions;
      expect(created).toEqual({ canManageUsers: true }); // others stripped
    });

    it('lets an admin author any permission', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ role: Role.ADMIN, memberRole: null });
      prisma.accessRole.aggregate.mockResolvedValueOnce({ _max: { position: 0 } });
      prisma.accessRole.findFirst.mockResolvedValueOnce(null);
      prisma.accessRole.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'r1', ...data }),
      );

      await service.createAccessRole({
        organizationId: 'org-1',
        requesterId: 'admin-1',
        name: 'Power',
        permissions: { canManageUsers: true, canAssignTasks: true },
      });
      const created = prisma.accessRole.create.mock.calls[0][0].data.permissions;
      expect(created).toEqual({ canManageUsers: true, canAssignTasks: true });
    });
  });
});
