import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SpaceRolesService } from '../space-roles.service';
import { spaceRoleServices, type SpaceRolesServiceParts } from './space-roles.service.fixture';

/**
 * Work roles, a second role per member, and day rates — the security half.
 *
 * ⚠️ THE PROPERTY THIS FILE PINS: a work role can never become a path to
 * authority. Its permissions are forced empty on every write, the management
 * slot keeps the external allow-list and the grant ceiling, and two roles exist
 * only where somebody switched it on.
 */
describe('SpaceRolesService — work roles', () => {
  let service: SpaceRolesServiceParts;

  const roles: Record<string, any> = {
    mech: { id: 'mech', organizationId: 'org1', name: 'Mechanic', kind: 'WORK', permissions: {}, isSystem: false },
    lead: { id: 'lead', organizationId: 'org1', name: 'Team Leader', kind: 'MANAGEMENT', permissions: { canApproveOvertime: true }, isSystem: false },
    boss: { id: 'boss', organizationId: 'org1', name: 'Space Manager', kind: 'MANAGEMENT', permissions: { canManageUsers: true, canManageAssets: true }, isSystem: true },
  };

  const tx = {
    rateHistory: { create: jest.fn(), findMany: jest.fn() },
    spaceAssignment: { update: jest.fn() },
  };
  const prisma: Record<string, any> = {
    $executeRawUnsafe: jest.fn(),
    companyLocation: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    accessRole: {
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    spaceAssignment: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };

  const member = (over: Record<string, any> = {}) => ({
    id: 'a1', userId: 'u1', spaceId: 's1', organizationId: 'org1',
    roleId: null, role: null, workRoleId: null, workRole: null,
    allowSecondRole: false, billBy: null,
    user: { isExternal: false },
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.companyLocation.findFirst.mockResolvedValue({ id: 's1' });
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', isExternal: false });
    prisma.accessRole.findFirst.mockImplementation(({ where }: any) => Promise.resolve(roles[where.id] ?? null));
    prisma.accessRole.aggregate.mockResolvedValue({ _max: { position: 3 } });
    prisma.accessRole.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data }));
    prisma.accessRole.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'x', ...data }));
    prisma.accessRole.findMany.mockResolvedValue([]);
    prisma.spaceAssignment.update.mockImplementation(({ data }: any) => Promise.resolve({ ...member(), ...data }));
    tx.rateHistory.findMany.mockResolvedValue([]);
    service = spaceRoleServices(prisma);
  });

  describe('a work role grants nothing', () => {
    it('drops every permission on create, whatever was sent', async () => {
      await service.createRole({ organizationId: 'org1', name: 'Mechanic', kind: 'WORK', permissions: { canManageUsers: true } as any });
      const data = prisma.accessRole.create.mock.calls[0][0].data;
      expect(data.permissions).toEqual({});
      expect(data.kind).toBe('WORK');
      // How a person is billed lives on the PERSON — never on the role.
      expect(data).not.toHaveProperty('billBy');
    });

    it('drops them again on every update', async () => {
      await service.updateRole({ organizationId: 'org1', roleId: 'mech', permissions: { canManageUsers: true } as any });
      expect(prisma.accessRole.update.mock.calls[0][0].data.permissions).toEqual({});
    });

    it('billing is set on the member, and saved there', async () => {
      prisma.spaceAssignment.findFirst.mockResolvedValue(member({ workRoleId: 'mech', workRole: roles.mech }));
      const r: any = await service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', billBy: 'DAY' });
      expect(prisma.spaceAssignment.update.mock.calls[0][0].data).toEqual({ billBy: 'DAY' });
      expect(r.data.effectiveBillBy).toBe('DAY');
    });
  });

  describe('the kind', () => {
    it('cannot change while anybody holds the role', async () => {
      prisma.spaceAssignment.count.mockResolvedValue(2);
      await expect(service.updateRole({ organizationId: 'org1', roleId: 'lead', kind: 'WORK' })).rejects.toBeInstanceOf(BadRequestException);
      // Counted in BOTH slots, so a trade in use is held too.
      expect(prisma.spaceAssignment.count.mock.calls[0][0].where.OR).toEqual([{ roleId: 'lead' }, { workRoleId: 'lead' }]);
    });

    it('a built-in role keeps its kind', async () => {
      await expect(service.updateRole({ organizationId: 'org1', roleId: 'boss', kind: 'WORK' })).rejects.toThrow(/built-in/);
    });

    it('a role in use in either slot cannot be deleted', async () => {
      prisma.spaceAssignment.count.mockResolvedValue(1);
      await expect(service.deleteRole({ organizationId: 'org1', roleId: 'mech' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.accessRole.delete).not.toHaveBeenCalled();
    });
  });

  describe('two roles', () => {
    it('refuses a second role unless it was allowed', async () => {
      prisma.spaceAssignment.findFirst.mockResolvedValue(member({ workRoleId: 'mech', workRole: roles.mech }));
      await expect(
        service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', managementRoleId: 'lead' }),
      ).rejects.toMatchObject({ response: { code: 'SECOND_ROLE_NOT_ALLOWED' } });
      expect(prisma.spaceAssignment.update).not.toHaveBeenCalled();
    });

    it('allows it when switched on', async () => {
      prisma.spaceAssignment.findFirst.mockResolvedValue(member({ workRoleId: 'mech', workRole: roles.mech, allowSecondRole: true }));
      await service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', managementRoleId: 'lead' });
      expect(prisma.spaceAssignment.update.mock.calls[0][0].data).toEqual({ roleId: 'lead' });
    });

    it('turning the switch off while holding both is refused, not a silent drop', async () => {
      prisma.spaceAssignment.findFirst.mockResolvedValue(
        member({ workRoleId: 'mech', workRole: roles.mech, roleId: 'lead', role: roles.lead, allowSecondRole: true }),
      );
      await expect(
        service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', allowSecondRole: false }),
      ).rejects.toMatchObject({ response: { code: 'SECOND_ROLE_NOT_ALLOWED' } });
    });

    it('each slot takes only its own kind', async () => {
      prisma.spaceAssignment.findFirst.mockResolvedValue(member());
      await expect(
        service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', workRoleId: 'lead' }),
      ).rejects.toMatchObject({ response: { code: 'WORK_ROLE_NOT_WORK' } });
      await expect(
        service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', managementRoleId: 'mech' }),
      ).rejects.toMatchObject({ response: { code: 'MANAGEMENT_ROLE_IS_WORK' } });
    });

    it('an external member holds no trade and is not billed', async () => {
      prisma.spaceAssignment.findFirst.mockResolvedValue(member({ user: { isExternal: true } }));
      await expect(
        service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', workRoleId: 'mech' }),
      ).rejects.toMatchObject({ response: { code: 'EXTERNAL_NO_WORK_ROLE' } });
      await expect(
        service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', billBy: 'DAY' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('the management slot keeps the grant ceiling — nobody grants what they do not hold', async () => {
      prisma.spaceAssignment.findFirst.mockResolvedValue(member());
      await expect(
        service.updateMemberRoles({
          organizationId: 'org1', spaceId: 's1', memberId: 'a1', managementRoleId: 'boss',
          requesterPerms: { canApproveOvertime: true },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.spaceAssignment.update).not.toHaveBeenCalled();
    });

    it('assigning a trade through the add-member path lands in the work slot', async () => {
      prisma.spaceAssignment.findUnique.mockResolvedValue(null);
      prisma.spaceAssignment.upsert.mockResolvedValue({ ...member(), workRoleId: 'mech', workRole: roles.mech, user: null, role: null });
      await service.assignMember({ organizationId: 'org1', spaceId: 's1', userId: 'u1', spaceRoleId: 'mech' });
      const call = prisma.spaceAssignment.upsert.mock.calls[0][0];
      expect(call.create.workRoleId).toBe('mech');
      expect(call.create.roleId).toBeUndefined();
      expect(call.update).toEqual({ workRoleId: 'mech' });
    });
  });

  describe('the day rate', () => {
    it('is a dated row for this workspace — never written over', async () => {
      await service.setRoleDayRate({ organizationId: 'org1', spaceId: 's1', roleId: 'mech', cents: 22000, effectiveFrom: '2026-11-01' });
      const row = tx.rateHistory.create.mock.calls[0][0].data;
      expect(row).toMatchObject({ target: 'ROLE', targetId: 'mech', spaceId: 's1', kind: 'BILL_DAY', cents: 22000 });
      expect(row.effectiveFrom.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });

    it('only a work role has one', async () => {
      await expect(
        service.setRoleDayRate({ organizationId: 'org1', spaceId: 's1', roleId: 'lead', cents: 100 }),
      ).rejects.toThrow(/work role/);
    });

    it('an impossible start day is a 400, not a 500', async () => {
      await expect(
        service.setRoleDayRate({ organizationId: 'org1', spaceId: 's1', roleId: 'mech', cents: 100, effectiveFrom: '2026-02-30' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.rateHistory.create).not.toHaveBeenCalled();
    });
  });

  describe('a member\'s hourly rate here', () => {
    const row = (cents: number, day: string) => ({
      target: 'ASSIGNMENT', targetId: 'a1', spaceId: null, kind: 'BILL_HOUR', cents,
      effectiveFrom: new Date(`${day}T00:00:00Z`), createdAt: new Date('2026-01-01'),
    });
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

    beforeEach(() => {
      prisma.spaceAssignment.findFirst.mockResolvedValue(member());
      tx.spaceAssignment.update.mockResolvedValue({ id: 'a1' });
    });

    it('a change scheduled ahead is recorded and leaves today\'s figure alone', async () => {
      tx.rateHistory.findMany.mockResolvedValue([row(8500, '1970-01-01')]);
      await service.updateMemberRate({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', billRateCents: 9000, effectiveFrom: inDays(30) });
      expect(tx.rateHistory.create).toHaveBeenCalledTimes(1);
      expect(tx.spaceAssignment.update.mock.calls[0][0].data).toEqual({ billRateCents: 8500 });
    });

    it('a change from today moves today\'s figure', async () => {
      tx.rateHistory.findMany.mockResolvedValue([row(8500, '1970-01-01')]);
      await service.updateMemberRate({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', billRateCents: 9000 });
      expect(tx.rateHistory.create.mock.calls[0][0].data.effectiveFrom.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
      expect(tx.spaceAssignment.update.mock.calls[0][0].data).toEqual({ billRateCents: 9000 });
    });

    it('the FIRST rate ever, with no start day, applies since always — last month is not billed at nothing', async () => {
      tx.rateHistory.findMany.mockResolvedValue([]);
      await service.updateMemberRate({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', billRateCents: 8500 });
      expect(tx.rateHistory.create.mock.calls[0][0].data.effectiveFrom.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    });
  });

  describe('a workspace uses the roles it switches on', () => {
    const workId = () => Object.values(roles as Record<string, any>).find((r: any) => r.kind === 'WORK')!.id as string;
    const mgmtId = () => Object.values(roles as Record<string, any>).find((r: any) => r.kind === 'MANAGEMENT')!.id as string;

    it('switching a role off is refused while somebody here holds it', async () => {
      prisma.spaceAssignment.count.mockResolvedValue(2);
      await expect(service.setWorkRoleHere({ organizationId: 'org1', spaceId: 's1', roleId: workId(), active: false }))
        .rejects.toMatchObject({ response: { code: 'WORK_ROLE_HELD_HERE', params: { count: 2 } } });
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('switching one on is one idempotent update', async () => {
      await service.setWorkRoleHere({ organizationId: 'org1', spaceId: 's1', roleId: workId(), active: true });
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toMatch(/NOT \(\$1 = ANY\("workRoleIds"\)\)/);
    });

    it('only a trade is switched on per workspace, and only trades merge', async () => {
      await expect(service.setWorkRoleHere({ organizationId: 'org1', spaceId: 's1', roleId: mgmtId(), active: true }))
        .rejects.toBeInstanceOf(BadRequestException);
      await expect(service.mergeRole({ organizationId: 'org1', roleId: workId(), intoRoleId: mgmtId() }))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
