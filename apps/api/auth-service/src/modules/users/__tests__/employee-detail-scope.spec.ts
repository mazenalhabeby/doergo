import { employeeDetailParts } from './employee-detail.service.fixture';

/**
 * Who may read a colleague's record, and how much of it.
 *
 * `GET /employees/:id` carried no permission decorator: any authenticated
 * member could fetch any other member's full profile — every task completed
 * across every space, hours worked, recent activity, and their last GPS
 * position. For an external member that is a client's supervisor reading the
 * work history and whereabouts of people at sites they have nothing to do with.
 *
 * The rule is layered rather than a single gate, because the questions are
 * genuinely different: working alongside somebody, supervising them, and
 * tracking them are three things, and they are not held by the same people.
 */
describe('employee detail visibility', () => {
  /** The rule as the service applies it. */
  const decide = (
    viewer: { orgWide?: boolean; spaces?: string[]; canViewTracking?: boolean },
    target: { spaces: string[] },
  ) => {
    const scoped = !viewer.orgWide;
    const viewerSpaces = viewer.spaces ?? [];
    if (scoped && !target.spaces.some((s) => viewerSpaces.includes(s))) return 'not-found';
    return {
      statsScopedTo: scoped ? viewerSpaces : 'all',
      // Coordinates are their own permission for EVERY viewer (audit 2026-10-09).
      location: viewer.canViewTracking === true,
    };
  };

  it('an org-wide viewer sees the whole record — the position only with canViewTracking', () => {
    expect(decide({ orgWide: true }, { spaces: ['s1'] })).toEqual({
      statsScopedTo: 'all',
      location: false,
    });
    expect(decide({ orgWide: true, canViewTracking: true }, { spaces: ['s1'] })).toEqual({
      statsScopedTo: 'all',
      location: true,
    });
  });

  it('a space-scoped viewer may open somebody they SHARE a space with', () => {
    expect(decide({ spaces: ['s1'] }, { spaces: ['s1', 's2'] })).not.toBe('not-found');
  });

  it('and may not open somebody they share none with — reads as not-found', () => {
    // Not "forbidden": whether a given colleague exists is itself something
    // this caller has no business learning.
    expect(decide({ spaces: ['s1'] }, { spaces: ['s2'] })).toBe('not-found');
  });

  it('their numbers cover the shared spaces only, not a career total', () => {
    const r = decide({ spaces: ['s1'] }, { spaces: ['s1', 's2'] }) as { statsScopedTo: string[] };
    expect(r.statsScopedTo).toEqual(['s1']);
    expect(r.statsScopedTo).not.toBe('all');
  });

  it('withholds the GPS position without canViewTracking', () => {
    const r = decide({ spaces: ['s1'] }, { spaces: ['s1'] }) as { location: boolean };
    expect(r.location).toBe(false);
  });

  it('returns it to a space-scoped viewer who holds canViewTracking', () => {
    const r = decide(
      { spaces: ['s1'], canViewTracking: true },
      { spaces: ['s1'] },
    ) as { location: boolean };
    expect(r.location).toBe(true);
  });
});

/** The service itself: the recent-activity feed follows the viewer's spaces. */
describe('UsersService employee recent activity — narrowed to the viewer\'s spaces', () => {
  function svc() {
    const s = employeeDetailParts() as any;
    s.prisma = {
      taskEvent: { findMany: jest.fn().mockResolvedValue([]) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return s;
  }

  it('a space-scoped viewer reads jobs and clock-ins in their spaces only', async () => {
    const s = svc();
    await s.getRecentActivityForEmployee('emp', ['s1']);
    expect(s.prisma.taskEvent.findMany.mock.calls[0][0].where).toEqual({ userId: 'emp', task: { spaceId: { in: ['s1'] } } });
    expect(s.prisma.timeEntry.findMany.mock.calls[0][0].where).toEqual({ userId: 'emp', locationId: { in: ['s1'] } });
  });

  it('an org-wide viewer (undefined) is not narrowed', async () => {
    const s = svc();
    await s.getRecentActivityForEmployee('emp');
    expect(s.prisma.taskEvent.findMany.mock.calls[0][0].where).toEqual({ userId: 'emp' });
    expect(s.prisma.timeEntry.findMany.mock.calls[0][0].where).toEqual({ userId: 'emp' });
  });

  it('getEmployeeDetail passes the viewer\'s spaces to the feed', async () => {
    const s = svc();
    s.prisma.user = { findFirst: jest.fn().mockResolvedValue({ id: 'emp', createdAt: new Date(), updatedAt: new Date(), lastLocation: null }) };
    s.prisma.spaceAssignment = { findFirst: jest.fn().mockResolvedValue({ id: 'sa' }) };
    s.getTaskStatsForEmployee = jest.fn().mockResolvedValue({});
    s.getAttendanceStatsForEmployee = jest.fn().mockResolvedValue({});
    s.getRecentActivityForEmployee = jest.fn().mockResolvedValue([]);
    s.isOnline = () => false;
    await s.getEmployeeDetail({ id: 'emp', organizationId: 'org', viewerSpaceIds: ['s1'] });
    expect(s.getRecentActivityForEmployee).toHaveBeenCalledWith('emp', ['s1']);
    await s.getEmployeeDetail({ id: 'emp', organizationId: 'org', viewerSpaceIds: null });
    expect(s.getRecentActivityForEmployee).toHaveBeenLastCalledWith('emp', undefined);
  });
});
