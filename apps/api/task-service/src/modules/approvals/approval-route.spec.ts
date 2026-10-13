import { ApprovalRouteService } from './approval-route.service';

const member = (id: string, extra: Record<string, unknown> = {}) => ({
  id, firstName: id, lastName: '', avatarUrl: null, isExternal: false, role: 'EMPLOYEE',
  canCreateTasks: false, canViewAllTasks: false, canAssignTasks: false, canManageUsers: false, canViewReports: false,
  memberRole: null, spaceAssignments: [], ...extra,
});

describe('ApprovalRouteService — who else could decide one item', () => {
  const prisma: any = { user: { findMany: jest.fn() }, timeOff: { findMany: jest.fn() } };
  const routing: any = { resolveWatchers: jest.fn() };
  const svc = new ApprovalRouteService(prisma, routing);

  beforeEach(() => jest.clearAllMocks());

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

  it('an unknown kind answers nothing', async () => {
    expect(await svc.route({ organizationId: 'o', callerId: 'me', kind: 'billing' as any, spaceId: null, subjectUserId: null }))
      .toEqual({ deciders: [], moreDeciders: 0, told: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
