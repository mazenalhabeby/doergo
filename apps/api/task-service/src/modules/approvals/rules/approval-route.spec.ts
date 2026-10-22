import { ApprovalRouteService } from './approval-route.service';

const member = (id: string, extra: Record<string, unknown> = {}) => ({
  id, firstName: id, lastName: '', avatarUrl: null, isExternal: false, role: 'EMPLOYEE',
  canCreateTasks: false, canViewAllTasks: false, canAssignTasks: false, canManageUsers: false, canViewReports: false,
  memberRole: null, spaceAssignments: [], ...extra,
});

describe('ApprovalRouteService — who else could decide one item', () => {
  const prisma: any = {
    user: { findMany: jest.fn() },
    timeOff: { findMany: jest.fn() },
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Vienna' }) },
    approvalDelegation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const routing: any = { resolveWatchers: jest.fn() };
  const svc = new ApprovalRouteService(prisma, routing);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organization.findUnique.mockResolvedValue({ timezone: 'Europe/Vienna' });
    prisma.approvalDelegation.findMany.mockResolvedValue([]);
  });

  it('lists exactly the people whose access decides it HERE, with the person on leave last; never the subject or the caller', async () => {
    prisma.user.findMany
      .mockResolvedValueOnce([
        member('admin', { role: 'ADMIN' }),
        member('leaderS1', { spaceAssignments: [{ spaceId: 's1', role: { permissions: { canApproveAttendance: true }, isActive: true } }] }),
        member('inactiveRole', { spaceAssignments: [{ spaceId: 's1', role: { permissions: { canApproveAttendance: true }, isActive: false } }] }),
        member('worker'),
      ])
      .mockResolvedValueOnce([{ id: 'watcher', firstName: 'Wanda', lastName: 'W' }]);
    prisma.timeOff.findMany.mockResolvedValue([{ technicianId: 'leaderS1' }]);
    routing.resolveWatchers.mockResolvedValue({ ids: ['watcher', 'admin'], emails: [] });

    const r = await svc.route({ organizationId: 'o', callerId: 'me', kind: 'hours', spaceId: 's1', subjectUserId: 'sub' });

    expect(r.deciders.map((d) => [d.id, d.via, d.onLeave])).toEqual([['admin', 'ADMIN', false], ['leaderS1', 'SPACE', true]]);
    expect(prisma.user.findMany.mock.calls[0][0].where.id).toEqual({ notIn: ['me', 'sub'] });
    // Told = informed, not deciding: a decider is not repeated there.
    expect(r.told).toEqual([{ id: 'watcher', name: 'Wanda W' }]);
  });

  it('a stand-in decides where the leader they cover does — but never about that leader', async () => {
    const leader = { id: 'leader', firstName: 'Lea', lastName: 'L', role: 'EMPLOYEE', canCreateTasks: false, canViewAllTasks: false, canAssignTasks: false, canManageUsers: false, canViewReports: false, memberRole: null,
      spaceAssignments: [{ spaceId: 's1', role: { permissions: { canApproveAttendance: true }, isActive: true } }] };
    prisma.approvalDelegation.findMany.mockResolvedValue([{ toUserId: 'deputy', fromUser: leader }]);
    prisma.timeOff.findMany.mockResolvedValue([]);
    routing.resolveWatchers.mockResolvedValue({ ids: [], emails: [] });

    prisma.user.findMany.mockResolvedValueOnce([member('deputy')]);
    const here = await svc.route({ organizationId: 'o', callerId: 'me', kind: 'hours', spaceId: 's1', subjectUserId: 'sub' });
    expect(here.deciders.map((d) => [d.id, d.via])).toEqual([['deputy', 'DELEGATED']]);

    prisma.user.findMany.mockResolvedValueOnce([member('deputy')]);
    const elsewhere = await svc.route({ organizationId: 'o', callerId: 'me', kind: 'hours', spaceId: 's2', subjectUserId: 'sub' });
    expect(elsewhere.deciders).toEqual([]);

    prisma.user.findMany.mockResolvedValueOnce([member('deputy')]);
    const aboutTheLeader = await svc.route({ organizationId: 'o', callerId: 'me', kind: 'hours', spaceId: 's1', subjectUserId: 'leader' });
    expect(aboutTheLeader.deciders).toEqual([]);

    // Money is never handed over.
    prisma.user.findMany.mockResolvedValueOnce([member('deputy')]);
    expect((await svc.route({ organizationId: 'o', callerId: 'me', kind: 'expense', spaceId: 's1', subjectUserId: 'sub' })).deciders).toEqual([]);
  });

  it('an unknown kind answers nothing', async () => {
    expect(await svc.route({ organizationId: 'o', callerId: 'me', kind: 'billing' as any, spaceId: null, subjectUserId: null }))
      .toEqual({ deciders: [], moreDeciders: 0, told: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
