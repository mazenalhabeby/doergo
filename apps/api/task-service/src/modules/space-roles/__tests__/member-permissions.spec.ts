import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { builtInRoleCatchUp, setAssignmentPermissions, AssignmentPermissionsError, SHARED_ROLE_WHERE } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SpaceRolesService } from '../space-roles.service';

/**
 * Per-person permissions in a workspace — the builder's writer and the role
 * doors around it (docs/plans/external-role-builder.md).
 *
 * The one property everything else rests on: a PERSONAL role is one person's
 * permissions in one workspace and nobody else may hold it, pick it or edit it
 * as a role. And every grant through the builder meets the same rules as any
 * other: workspace keys only, the external allow-list, the giver's ceiling.
 */

const SHARED = [
  { id: 'r-observer', permissions: { canViewAllTasks: true, canCreateTasks: true } },
  { id: 'r-supervisor', permissions: { canViewAllTasks: true, canApproveOvertime: true, canReconcileAttendance: true, canViewSpaceAttendance: true } },
];

function makeDb(over: { assignment?: any; role?: any } = {}): any {
  const assignment = over.assignment === undefined
    ? {
        id: 'a1', organizationId: 'org1', spaceId: 's1', userId: 'u-ext', roleId: null, workRoleId: null, allowSecondRole: false,
        role: null, user: { isExternal: true, firstName: 'Ann', lastName: 'Lee' }, space: { name: 'Site A' },
      }
    : over.assignment;
  return {
    spaceAssignment: {
      findFirst: jest.fn(async ({ where }: any) => (assignment && where.id === assignment.id && (!where.spaceId || where.spaceId === assignment.spaceId) ? assignment : null)),
      update: jest.fn(async ({ data }: any) => ({ ...assignment, ...data })),
    },
    accessRole: {
      findFirst: jest.fn(async () => over.role ?? null),
      findMany: jest.fn(async () => SHARED),
      upsert: jest.fn(async () => ({ id: 'r-personal' })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
}

const run = (db: any, input: Partial<Parameters<typeof setAssignmentPermissions>[1]>) =>
  setAssignmentPermissions(db, {
    organizationId: 'org1',
    assignmentId: 'a1',
    spaceId: 's1',
    choice: { permissions: {} },
    ceiling: null,
    ...input,
  } as any);

async function refusal(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof AssignmentPermissionsError) return e;
    throw e;
  }
  throw new Error('expected a refusal');
}

describe('setAssignmentPermissions — the one writer', () => {
  it('a set that is exactly a shared role IS that role, and no personal role is kept', async () => {
    const db = makeDb();
    const out = await run(db, { choice: { permissions: { canViewAllTasks: true, canCreateTasks: true } } });
    expect(out).toMatchObject({ roleId: 'r-observer', personal: false });
    expect(db.accessRole.upsert).not.toHaveBeenCalled();
    expect(db.spaceAssignment.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { roleId: 'r-observer' } });
    expect(db.accessRole.deleteMany).toHaveBeenCalledWith({ where: { personalAssignmentId: 'a1' } });
    // The matching pool is SHARED management roles only.
    expect(db.accessRole.findMany.mock.calls[0][0].where).toMatchObject({ ...SHARED_ROLE_WHERE, kind: 'MANAGEMENT', isActive: true });
  });

  it('anything else becomes THIS assignment’s personal role', async () => {
    const db = makeDb();
    const out = await run(db, { choice: { permissions: { canViewAllTasks: true, canViewAssets: true } } });
    expect(out).toMatchObject({ roleId: 'r-personal', personal: true });
    const args = db.accessRole.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ personalAssignmentId: 'a1' });
    expect(args.create).toMatchObject({
      slug: 'personal-a1', personalAssignmentId: 'a1', scope: 'SPACE', kind: 'MANAGEMENT', isSystem: false,
      name: 'Ann Lee · Site A', permissions: { canViewAllTasks: true, canViewAssets: true },
    });
    expect(db.accessRole.deleteMany).not.toHaveBeenCalled();
  });

  it('nothing granted is no role at all', async () => {
    const db = makeDb({ assignment: { id: 'a1', organizationId: 'org1', spaceId: 's1', userId: 'u', roleId: 'r-personal', role: { permissions: {} }, user: { isExternal: true } } });
    const out = await run(db, { choice: { permissions: {} } });
    expect(out.roleId).toBeNull();
    expect(db.spaceAssignment.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { roleId: null } });
    expect(db.accessRole.deleteMany).toHaveBeenCalled();
  });

  it('an organization-only or unknown key is never stored', async () => {
    const db = makeDb({ assignment: { id: 'a1', organizationId: 'org1', spaceId: 's1', userId: 'u', role: null, user: { isExternal: false } } });
    await run(db, { choice: { permissions: { canViewAllTasks: true, canViewLabourCost: true, made_up: true } } });
    expect(db.accessRole.upsert.mock.calls[0][0].create.permissions).toEqual({ canViewAllTasks: true });
  });

  it("refuses somebody else's personal role — it reads as a role that does not exist", async () => {
    const db = makeDb({ role: { id: 'r-other', permissions: {}, kind: 'MANAGEMENT', personalAssignmentId: 'a-other' } });
    const e = await refusal(run(db, { choice: { roleId: 'r-other' } }));
    expect(e).toMatchObject({ status: 404, code: 'ROLE_NOT_FOUND' });
    expect(db.spaceAssignment.update).not.toHaveBeenCalled();
  });

  it('accepts its own personal role back (saving unchanged)', async () => {
    const db = makeDb({ role: { id: 'r-personal', permissions: { canViewAssets: true }, kind: 'MANAGEMENT', personalAssignmentId: 'a1' } });
    const out = await run(db, { choice: { roleId: 'r-personal' } });
    expect(out).toMatchObject({ roleId: 'r-personal', personal: true });
    expect(db.accessRole.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses an external member what the allow-list forbids, naming the keys', async () => {
    const db = makeDb();
    const e = await refusal(run(db, { choice: { permissions: { canViewAllTasks: true, canManageUsers: true } } }));
    expect(e).toMatchObject({ status: 400, code: 'EXTERNAL_PERMISSION_FORBIDDEN', params: { keys: ['canManageUsers'] } });
    expect(db.accessRole.upsert).not.toHaveBeenCalled();
  });

  it('refuses what the giver does not hold here (the ceiling)', async () => {
    const db = makeDb();
    const e = await refusal(run(db, { ceiling: { canViewAllTasks: true, canGrantSpaceRoles: true }, actorId: 'boss', choice: { permissions: { canViewAllTasks: true, canViewAssets: true } } }));
    expect(e).toMatchObject({ status: 403, code: 'GRANT_EXCEEDS_OWN', params: { keys: ['canViewAssets'] } });
  });

  it('refuses re-shaping somebody who holds more here than the giver', async () => {
    const db = makeDb({ assignment: { id: 'a1', organizationId: 'org1', spaceId: 's1', userId: 'u', role: { permissions: { canViewAllTasks: true, canApproveAttendance: true } }, user: { isExternal: true } } });
    const e = await refusal(run(db, { ceiling: { canViewAllTasks: true, canGrantSpaceRoles: true }, actorId: 'boss', choice: { permissions: {} } }));
    expect(e).toMatchObject({ status: 403, code: 'MEMBER_ABOVE_YOU' });
    // …unless the caller manages members org-wide (the org paths never had that rule).
    await expect(run(db, { ceiling: { canViewAllTasks: true, canGrantSpaceRoles: true }, actorId: 'boss', outrankCheck: false, choice: { permissions: {} } })).resolves.toBeTruthy();
  });

  it('refuses changing your own permissions', async () => {
    const db = makeDb();
    const e = await refusal(run(db, { ceiling: { canViewAllTasks: true }, actorId: 'u-ext', choice: { permissions: {} } }));
    expect(e).toMatchObject({ status: 403, code: 'CANNOT_CHANGE_OWN' });
  });

  it('an assignment in ANOTHER workspace is not found — a grant in space A never reaches space B', async () => {
    const db = makeDb();
    const e = await refusal(run(db, { spaceId: 's-other', choice: { permissions: { canViewAllTasks: true } } }));
    expect(e).toMatchObject({ status: 404, code: 'ASSIGNMENT_NOT_FOUND' });
    expect(db.spaceAssignment.findFirst.mock.calls[0][0].where).toMatchObject({ organizationId: 'org1', spaceId: 's-other' });
  });

  it('keeps the two-role rule: a trade here and no second role allowed', async () => {
    const db = makeDb({ assignment: { id: 'a1', organizationId: 'org1', spaceId: 's1', userId: 'u', workRoleId: 'mech', allowSecondRole: false, role: null, user: { isExternal: false } } });
    const e = await refusal(run(db, { choice: { permissions: { canViewAllTasks: true } } }));
    expect(e).toMatchObject({ status: 400, code: 'SECOND_ROLE_NOT_ALLOWED' });
  });
});

describe('personal roles never leak', () => {
  const prisma: Record<string, any> = {
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    $executeRawUnsafe: jest.fn(),
    companyLocation: { findFirst: jest.fn(), findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    rateHistory: { findMany: jest.fn().mockResolvedValue([]) },
    accessRole: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    spaceAssignment: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
  };
  let service: SpaceRolesService;
  const othersPersonal = { id: 'r-p', name: 'Bob · Site A', organizationId: 'org1', scope: 'SPACE', kind: 'MANAGEMENT', isSystem: false, permissions: {}, personalAssignmentId: 'a-bob' };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.companyLocation.findFirst.mockResolvedValue({ id: 's1' });
    prisma.companyLocation.findUnique.mockResolvedValue({ workRoleIds: [] });
    prisma.user.findFirst.mockResolvedValue({ id: 'u2', isExternal: false });
    prisma.accessRole.findMany.mockResolvedValue([]);
    prisma.spaceAssignment.findMany.mockResolvedValue([]);
    const mod = await Test.createTestingModule({
      providers: [SpaceRolesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(SpaceRolesService);
  });

  it('the role lists exclude them', async () => {
    await service.listRoles({ organizationId: 'org1' });
    const listCall = prisma.accessRole.findMany.mock.calls.find((c: any[]) => c[0]?.include?._count);
    expect(listCall[0].where).toMatchObject(SHARED_ROLE_WHERE);

    prisma.accessRole.findMany.mockClear();
    await service.listSpaceRoles({ organizationId: 'org1', spaceId: 's1' });
    const spaceCall = prisma.accessRole.findMany.mock.calls.find((c: any[]) => c[0]?.select?._count);
    expect(spaceCall[0].where).toMatchObject(SHARED_ROLE_WHERE);
  });

  it('cannot be edited, deleted or merged as a role', async () => {
    prisma.accessRole.findFirst.mockResolvedValue(othersPersonal);
    await expect(service.updateRole({ organizationId: 'org1', roleId: 'r-p', name: 'Mine now' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteRole({ organizationId: 'org1', roleId: 'r-p' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.accessRole.update).not.toHaveBeenCalled();
  });

  it("cannot be assigned to somebody else — not by assigning, not by the roles route", async () => {
    prisma.accessRole.findFirst.mockResolvedValue(othersPersonal);
    prisma.spaceAssignment.findUnique.mockResolvedValue({ id: 'a-me', roleId: null, workRoleId: null, allowSecondRole: false, role: null });
    await expect(service.assignMember({ organizationId: 'org1', spaceId: 's1', userId: 'u2', spaceRoleId: 'r-p' })).rejects.toBeInstanceOf(NotFoundException);

    prisma.spaceAssignment.findFirst.mockResolvedValue({ id: 'a-me', roleId: null, workRoleId: null, allowSecondRole: false, user: { isExternal: false }, role: null, workRole: null });
    await expect(service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a-me', managementRoleId: 'r-p' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.spaceAssignment.upsert).not.toHaveBeenCalled();
    expect(prisma.spaceAssignment.update).not.toHaveBeenCalled();
  });

  it('the built-in catch-up never touches one', () => {
    expect(builtInRoleCatchUp({ slug: 'space-manager', isSystem: true, isCustomized: false, permissions: {}, personalAssignmentId: 'a1' })).toBeNull();
  });

  it('a role picked on the roles route drops the personal role it replaces', async () => {
    const shared = { id: 'r-shared', organizationId: 'org1', scope: 'SPACE', kind: 'MANAGEMENT', permissions: { canViewAllTasks: true }, personalAssignmentId: null };
    prisma.accessRole.findFirst.mockResolvedValue(shared);
    prisma.spaceAssignment.findFirst.mockResolvedValue({ id: 'a-me', roleId: 'r-mine', workRoleId: null, allowSecondRole: false, user: { isExternal: false }, role: { permissions: {} }, workRole: null });
    prisma.spaceAssignment.update.mockResolvedValue({ id: 'a-me', roleId: 'r-shared', user: null, role: shared, workRole: null });
    await service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a-me', managementRoleId: 'r-shared' });
    expect(prisma.accessRole.deleteMany).toHaveBeenCalledWith({ where: { personalAssignmentId: 'a-me', id: { not: 'r-shared' } } });
  });
});

describe('who may change what about a workspace’s people', () => {
  const prisma: Record<string, any> = {
    $executeRawUnsafe: jest.fn(),
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'u2', isExternal: false }) },
    accessRole: { findFirst: jest.fn(), deleteMany: jest.fn() },
    spaceAssignment: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
  let service: SpaceRolesService;
  const mgmt = { id: 'r-obs', organizationId: 'org1', scope: 'SPACE', kind: 'MANAGEMENT', permissions: { canViewAllTasks: true }, personalAssignmentId: null };
  const addOnly = { addMembers: true, grantRoles: false, manageTerms: false };
  const grantOnly = { addMembers: false, grantRoles: true, manageTerms: false };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.accessRole.findFirst.mockResolvedValue(mgmt);
    prisma.spaceAssignment.upsert.mockResolvedValue({ id: 'a-new', userId: 'u2', roleId: null, user: null, role: null, workRole: null });
    const mod = await Test.createTestingModule({
      providers: [SpaceRolesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(SpaceRolesService);
  });

  it('adding a NEW person needs canAddSpaceMembers', async () => {
    prisma.spaceAssignment.findUnique.mockResolvedValue(null);
    await expect(service.assignMember({ organizationId: 'org1', spaceId: 's1', userId: 'u2', authority: grantOnly })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assignMember({ organizationId: 'org1', spaceId: 's1', userId: 'u2', authority: addOnly })).resolves.toBeTruthy();
  });

  it('giving the person a management role needs canGrantSpaceRoles as well', async () => {
    prisma.spaceAssignment.findUnique.mockResolvedValue(null);
    await expect(
      service.assignMember({ organizationId: 'org1', spaceId: 's1', userId: 'u2', spaceRoleId: 'r-obs', authority: addOnly }),
    ).rejects.toMatchObject({ response: { code: 'SPACE_MEMBER_NOT_ALLOWED' } });
    expect(prisma.spaceAssignment.upsert).not.toHaveBeenCalled();
  });

  it('a trade, billing basis or second-role switch stays with whoever manages the space’s people', async () => {
    prisma.spaceAssignment.findFirst.mockResolvedValue({ id: 'a1', roleId: null, workRoleId: null, allowSecondRole: false, user: { isExternal: false }, role: null, workRole: null });
    await expect(
      service.updateMemberRoles({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', billBy: 'DAY', authority: { addMembers: true, grantRoles: true, manageTerms: false } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.spaceAssignment.update).not.toHaveBeenCalled();
  });

  it('a space-only actor may not remove somebody who holds more there', async () => {
    prisma.spaceAssignment.findFirst.mockResolvedValue({ id: 'a1', role: { permissions: { canViewAllTasks: true, canApproveAttendance: true } } });
    await expect(
      service.removeMember({ organizationId: 'org1', spaceId: 's1', memberId: 'a1', outrankPerms: { canViewAllTasks: true, canAddSpaceMembers: true } }),
    ).rejects.toMatchObject({ response: { code: 'MEMBER_ABOVE_YOU' } });
    expect(prisma.spaceAssignment.delete).not.toHaveBeenCalled();
  });

  it('the builder routes through the shared writer, narrowed to the route’s workspace', async () => {
    prisma.spaceAssignment.findFirst.mockResolvedValue(null);
    const tx = { ...prisma };
    (prisma as any).$transaction = jest.fn(async (fn: any) => fn(tx));
    await expect(
      service.setMemberPermissions({ organizationId: 'org1', spaceId: 's1', assignmentId: 'a-elsewhere', choice: { permissions: { canViewAllTasks: true } } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.spaceAssignment.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'a-elsewhere', spaceId: 's1', organizationId: 'org1' });
  });
});
