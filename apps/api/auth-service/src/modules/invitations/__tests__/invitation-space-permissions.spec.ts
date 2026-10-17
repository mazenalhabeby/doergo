import { invitationServices } from './invitation.service.fixture';
import { applyInvitationPlacement, invitationSpaceGrantNow } from '../invitation-apply';

/**
 * An external invitation can carry what the person may do in its workspace
 * (`Invitation.spacePermissions`, built in the permission builder) instead of
 * naming a role. Checked when the invitation is made, checked again — and only
 * ever NARROWED — when it is accepted, and applied by the builder's own writer.
 */
describe('creating an external invitation with workspace permissions', () => {
  function make(opts: { creator?: any; space?: any; spaceRole?: any } = {}) {
    const prisma: any = {
      companyLocation: { findFirst: jest.fn().mockResolvedValue(opts.space === undefined ? { id: 's1' } : opts.space) },
      accessRole: { findFirst: jest.fn().mockResolvedValue(opts.spaceRole ?? null) },
      user: {
        // The inviter: a member manager whose role here grants task work only.
        findFirst: jest.fn().mockResolvedValue(
          opts.creator ?? {
            role: 'EMPLOYEE',
            canManageUsers: true,
            memberRole: null,
            spaceAssignments: [{ spaceId: 's1', role: { permissions: { canViewAllTasks: true, canCreateTasks: true }, isActive: true } }],
          },
        ),
      },
      invitation: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ ...data, id: 'inv1', status: 'PENDING', createdAt: new Date(), expiresAt: data.expiresAt, organization: null, createdBy: null })),
      },
    };
    const svc = invitationServices(prisma, { emit: jest.fn() } as any, {} as any);
    return { svc, prisma };
  }
  const base = {
    targetRole: 'EMPLOYEE',
    organizationId: 'org1',
    createdById: 'boss',
    creatorRole: 'EMPLOYEE',
    isExternal: true,
    spaceId: 's1',
  };

  it('stores the permissions, kept to workspace keys, and echoes them', async () => {
    const { svc, prisma } = make();
    const res: any = await svc.createInvitation({ ...base, spacePermissions: { canViewAllTasks: true, canCreateTasks: true, canViewAssets: false } });
    expect(res.success).toBe(true);
    expect(prisma.invitation.create.mock.calls[0][0].data.spacePermissions).toEqual({ canViewAllTasks: true, canCreateTasks: true });
    expect(prisma.invitation.create.mock.calls[0][0].data.memberRoleId).toBeNull();
    expect(res.data.spacePermissions).toEqual({ canViewAllTasks: true, canCreateTasks: true });
  });

  it('refuses what an external member may never hold, naming it', async () => {
    const { svc, prisma } = make();
    const res: any = await svc.createInvitation({ ...base, creatorRole: 'ADMIN', spacePermissions: { canViewAllTasks: true, canManageUsers: true } });
    expect(res).toMatchObject({ success: false, code: 'EXTERNAL_PERMISSION_FORBIDDEN', params: { keys: ['canManageUsers'] } });
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it('refuses an organization key outright rather than dropping it', async () => {
    const { svc } = make();
    const res: any = await svc.createInvitation({ ...base, creatorRole: 'ADMIN', spacePermissions: { canViewLabourCost: true } });
    expect(res).toMatchObject({ success: false, code: 'PERMISSION_KEY_NOT_IN_SPACE', params: { keys: ['canViewLabourCost'] } });
  });

  it('refuses more than the inviter holds IN THAT WORKSPACE', async () => {
    const { svc, prisma } = make();
    const res: any = await svc.createInvitation({ ...base, spacePermissions: { canViewAllTasks: true, canApproveAttendance: true } });
    expect(res).toMatchObject({ success: false, statusCode: 403, code: 'GRANT_EXCEEDS_OWN', params: { keys: ['canApproveAttendance'] } });
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it('is for an external member, in a named workspace, instead of a role — never alongside one', async () => {
    const { svc } = make();
    expect(await svc.createInvitation({ ...base, isExternal: false, spacePermissions: { canViewAllTasks: true } } as any))
      .toMatchObject({ success: false, code: 'SPACE_PERMISSIONS_EXTERNAL_ONLY' });
    expect(await svc.createInvitation({ ...base, spaceId: undefined, spacePermissions: { canViewAllTasks: true } }))
      .toMatchObject({ success: false, code: 'SPACE_PERMISSIONS_NEED_SPACE' });
    expect(await svc.createInvitation({ ...base, memberRoleId: 'r1', spacePermissions: { canViewAllTasks: true } }))
      .toMatchObject({ success: false, code: 'PERMISSIONS_CHOICE_INVALID' });
    expect(await svc.createInvitation({ ...base, spacePermissions: {} }))
      .toMatchObject({ success: false, code: 'SPACE_PERMISSIONS_EMPTY' });
  });

  it('a named role must be a SHARED space role — a personal role reads as no role', async () => {
    const { svc, prisma } = make({ spaceRole: null });
    const res: any = await svc.createInvitation({ ...base, creatorRole: 'ADMIN', memberRoleId: 'r-personal' });
    expect(res.success).toBe(false);
    expect(prisma.accessRole.findFirst.mock.calls[0][0].where).toMatchObject({ personalAssignmentId: null, scope: 'SPACE' });
  });

  it('a named space role is now actually kept (it used to be refused as "Invalid role")', async () => {
    const { svc, prisma } = make({ spaceRole: { id: 'r-observer', permissions: { canViewAllTasks: true, canCreateTasks: true } } });
    const res: any = await svc.createInvitation({ ...base, memberRoleId: 'r-observer' });
    expect(res.success).toBe(true);
    expect(prisma.invitation.create.mock.calls[0][0].data.memberRoleId).toBe('r-observer');
  });
});

describe('accepting it', () => {
  const inv = (over: Record<string, unknown> = {}) => ({
    organizationId: 'org1',
    targetRole: 'EMPLOYEE',
    isExternal: true,
    memberRoleId: null,
    spaceId: 's1',
    scheduleType: null,
    schedule: null,
    createdById: 'boss',
    spacePermissions: { canViewAllTasks: true, canCreateTasks: true, canViewAssets: true },
    ...over,
  });
  function tx(inviter: any) {
    return {
      technicianSchedule: { createMany: jest.fn() },
      companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
      user: { findFirst: jest.fn().mockResolvedValue(inviter) },
      spaceAssignment: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'a-new' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'a-new', organizationId: 'org1', spaceId: 's1', userId: 'u-new', roleId: null, workRoleId: null, allowSecondRole: false,
          role: null, user: { isExternal: true, firstName: 'Eve', lastName: 'Ng' }, space: { name: 'Site A' },
        }),
        update: jest.fn(),
      },
      accessRole: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'r-personal' }),
        deleteMany: jest.fn(),
      },
    } as any;
  }

  it('narrows to what the inviter still holds there — never a refusal, never wider', async () => {
    const t = tx({ role: 'EMPLOYEE', memberRole: null, spaceAssignments: [{ spaceId: 's1', role: { permissions: { canViewAllTasks: true, canCreateTasks: true }, isActive: true } }] });
    await expect(invitationSpaceGrantNow(t, inv() as any)).resolves.toEqual({ canViewAllTasks: true, canCreateTasks: true });
  });

  it('an inviter who has left grants nothing', async () => {
    await expect(invitationSpaceGrantNow(tx(null), inv() as any)).resolves.toEqual({});
  });

  it('becomes the new assignment’s personal role through the builder’s writer', async () => {
    const t = tx({ role: 'ADMIN', memberRole: null, spaceAssignments: [] });
    await applyInvitationPlacement(t, inv() as any, 'u-new');
    // Created with no role, then given exactly the invited set.
    expect(t.spaceAssignment.upsert.mock.calls[0][0].create.roleId).toBeNull();
    expect(t.accessRole.upsert.mock.calls[0][0]).toMatchObject({
      where: { personalAssignmentId: 'a-new' },
      create: { personalAssignmentId: 'a-new', permissions: { canViewAllTasks: true, canCreateTasks: true, canViewAssets: true } },
    });
    expect(t.spaceAssignment.update).toHaveBeenCalledWith({ where: { id: 'a-new' }, data: { roleId: 'r-personal' } });
  });

  it('never overwrites an assignment that already exists', async () => {
    const t = tx({ role: 'ADMIN', memberRole: null, spaceAssignments: [] });
    t.spaceAssignment.findUnique.mockResolvedValue({ id: 'a-old' });
    await applyInvitationPlacement(t, inv() as any, 'u-new');
    expect(t.accessRole.upsert).not.toHaveBeenCalled();
    expect(t.spaceAssignment.update).not.toHaveBeenCalled();
  });
});
