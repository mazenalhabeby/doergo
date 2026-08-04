import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SpaceRolesService } from '../space-roles.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BUILTIN_SPACE_ROLES } from '@hbcfield/shared';

describe('SpaceRolesService', () => {
  let service: SpaceRolesService;

  const prisma = {
    spaceRole: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    spaceMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    companyLocation: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.spaceRole.count.mockResolvedValue(1); // roles already seeded by default
    prisma.spaceRole.aggregate.mockResolvedValue({ _max: { position: 2 } });
    prisma.spaceRole.findFirst.mockResolvedValue(null); // no slug clash by default

    const module: TestingModule = await Test.createTestingModule({
      providers: [SpaceRolesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SpaceRolesService);
  });

  describe('listRoles', () => {
    it('lazily seeds the built-in roles on first access (empty org)', async () => {
      prisma.spaceRole.count.mockResolvedValue(0);
      prisma.spaceRole.findMany.mockResolvedValue([]);

      await service.listRoles({ organizationId: 'org-1' });

      expect(prisma.spaceRole.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ slug: 'shift-leader', isSystem: true })]),
          skipDuplicates: true,
        }),
      );
      expect(prisma.spaceRole.createMany.mock.calls[0][0].data).toHaveLength(BUILTIN_SPACE_ROLES.length);
    });

    it('does not re-seed when roles already exist', async () => {
      prisma.spaceRole.count.mockResolvedValue(3);
      prisma.spaceRole.findMany.mockResolvedValue([]);
      await service.listRoles({ organizationId: 'org-1' });
      expect(prisma.spaceRole.createMany).not.toHaveBeenCalled();
    });
  });

  describe('createRole', () => {
    it('slugifies the name and normalizes permissions to booleans', async () => {
      prisma.spaceRole.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));

      await service.createRole({
        organizationId: 'org-1',
        name: 'Night Supervisor!',
        permissions: { canApproveOvertime: true } as any,
      });

      const arg = prisma.spaceRole.create.mock.calls[0][0].data;
      expect(arg.slug).toBe('night-supervisor');
      expect(arg.isSystem).toBe(false);
      // Unspecified permissions default to false (no undefined leaking through).
      expect(arg.permissions).toEqual({
        canApproveOvertime: true,
        canManageRota: false,
        canReconcileAttendance: false,
        canViewSpaceAttendance: false,
      });
    });

    it('appends a suffix when the slug already exists', async () => {
      prisma.spaceRole.findFirst
        .mockResolvedValueOnce({ id: 'existing' }) // "lead" taken
        .mockResolvedValueOnce(null); // "lead-2" free
      prisma.spaceRole.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r2', ...data }));

      await service.createRole({ organizationId: 'org-1', name: 'Lead' });

      expect(prisma.spaceRole.create.mock.calls[0][0].data.slug).toBe('lead-2');
    });

    it('rejects an empty name', async () => {
      await expect(service.createRole({ organizationId: 'org-1', name: '   ' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteRole', () => {
    it('blocks deleting a built-in (system) role', async () => {
      prisma.spaceRole.findFirst.mockResolvedValue({ id: 'r1', organizationId: 'org-1', isSystem: true });
      await expect(service.deleteRole({ organizationId: 'org-1', roleId: 'r1' })).rejects.toThrow(BadRequestException);
      expect(prisma.spaceRole.delete).not.toHaveBeenCalled();
    });

    it('deletes a custom role', async () => {
      prisma.spaceRole.findFirst.mockResolvedValue({ id: 'r2', organizationId: 'org-1', isSystem: false });
      prisma.spaceRole.delete.mockResolvedValue({});
      const res = (await service.deleteRole({ organizationId: 'org-1', roleId: 'r2' })) as any;
      expect(res.success).toBe(true);
      expect(prisma.spaceRole.delete).toHaveBeenCalledWith({ where: { id: 'r2' } });
    });

    it('404s a role from another org', async () => {
      prisma.spaceRole.findFirst.mockResolvedValue(null);
      await expect(service.deleteRole({ organizationId: 'org-1', roleId: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignMember', () => {
    it('upserts membership after verifying space, user, and role belong to the org', async () => {
      prisma.companyLocation.findFirst.mockResolvedValue({ id: 'sp-1' });
      prisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
      prisma.spaceRole.findFirst.mockResolvedValue({ id: 'role-1', organizationId: 'org-1', isSystem: true });
      prisma.spaceMember.upsert.mockResolvedValue({ id: 'm-1' });

      await service.assignMember({ organizationId: 'org-1', spaceId: 'sp-1', userId: 'u-1', spaceRoleId: 'role-1' });

      expect(prisma.spaceMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId_spaceId: { userId: 'u-1', spaceId: 'sp-1' } } }),
      );
    });

    it('404s when the space is not in the org', async () => {
      prisma.companyLocation.findFirst.mockResolvedValue(null);
      await expect(
        service.assignMember({ organizationId: 'org-1', spaceId: 'nope', userId: 'u-1' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.spaceMember.upsert).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('404s a member outside the org/space scope', async () => {
      prisma.spaceMember.findFirst.mockResolvedValue(null);
      await expect(
        service.removeMember({ organizationId: 'org-1', spaceId: 'sp-1', memberId: 'm-x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
