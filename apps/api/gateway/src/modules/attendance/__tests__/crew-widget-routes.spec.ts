/**
 * The gateway half of the phone's Crew card: the four routes it reads.
 *
 *   GET /attendance/all-entries?status=CLOCKED_IN
 *   GET /attendance/breaks/active
 *   GET /attendance/no-shows?days=1
 *   GET /attendance/approvals/pending?summary=true
 *
 * Two things must hold for every one of them, and both are invisible in review:
 *
 *   1. the gate is `canViewSpaceAttendance` — a headcount of who is on the
 *      floor is attendance, never "the work" (`canViewAllTasks` is the €2
 *      External Observer's seat);
 *   2. the SERVICE is handed the spaces that grant it — the guard only widens,
 *      so a scope that is not forwarded is the whole organization.
 */
import 'reflect-metadata';
import { PERMISSIONS_IN_SPACE_KEY } from '@hbcfield/shared';
import { attendanceControllers, attendanceRoute } from './attendance-controllers.fixture';

const ROUTES = ['getAllEntries', 'getActiveBreaks', 'listNoShows', 'getPendingApprovals'] as const;

function controller() {
  const service = {
    getAllEntries: jest.fn().mockResolvedValue({ data: [] }),
    getActiveBreaks: jest.fn().mockResolvedValue({ data: [] }),
    listNoShows: jest.fn().mockResolvedValue({ data: [] }),
    getPendingApprovals: jest.fn().mockResolvedValue({ total: 0, bySpace: {} }),
  };
  const ctrl = attendanceControllers(service as any, {} as any);
  return { ctrl: ctrl as any, service };
}

const admin = { id: 'admin', role: 'ADMIN', organizationId: 'org-1', access: { org: {}, perSpace: {} } };
const siteLead = {
  id: 'lead', role: 'EMPLOYEE', organizationId: 'org-1',
  access: {
    org: {},
    perSpace: {
      'space-a': { canViewSpaceAttendance: true },
      // A space where they only see the work — must NOT widen attendance.
      'space-b': { canViewAllTasks: true },
    },
  },
};
const orgManager = { id: 'mgr', role: 'EMPLOYEE', organizationId: 'org-1', access: { org: { canViewSpaceAttendance: true }, perSpace: {} } };
const nobody = { id: 'n', role: 'EMPLOYEE', organizationId: 'org-1', access: { org: {}, perSpace: {} } };

async function call(ctrl: any, route: (typeof ROUTES)[number], user: any) {
  const req = { user };
  switch (route) {
    case 'getAllEntries':
      return ctrl.getAllEntries(undefined, undefined, undefined, 'CLOCKED_IN', undefined, undefined, 300, undefined, undefined, req);
    case 'getActiveBreaks':
      return ctrl.getActiveBreaks(req);
    case 'listNoShows':
      return ctrl.listNoShows(1, undefined, req);
    case 'getPendingApprovals':
      return ctrl.getPendingApprovals(undefined, undefined, req, 'true');
  }
}

describe('Crew card routes — the gate', () => {
  it.each(ROUTES)('%s requires canViewSpaceAttendance, and only that', (route) => {
    const perms = Reflect.getMetadata(PERMISSIONS_IN_SPACE_KEY, attendanceRoute(route));
    expect(perms).toEqual(['canViewSpaceAttendance']);
  });
});

describe('Crew card routes — the scope handed to the service', () => {
  it.each(ROUTES)('%s: an admin is never narrowed (null)', async (route) => {
    const { ctrl, service } = controller();
    await call(ctrl, route, admin);
    expect(service[route].mock.calls[0][0].scopeSpaceIds).toBeNull();
    expect(service[route].mock.calls[0][0].organizationId).toBe('org-1');
  });

  it.each(ROUTES)('%s: an org-wide grant is org-wide (null)', async (route) => {
    const { ctrl, service } = controller();
    await call(ctrl, route, orgManager);
    expect(service[route].mock.calls[0][0].scopeSpaceIds).toBeNull();
  });

  it.each(ROUTES)('%s: a site lead gets ONLY the space granting attendance', async (route) => {
    const { ctrl, service } = controller();
    await call(ctrl, route, siteLead);
    expect(service[route].mock.calls[0][0].scopeSpaceIds).toEqual(['space-a']);
  });

  it.each(ROUTES)('%s: granted nowhere is [] — matches nothing, never null', async (route) => {
    const { ctrl, service } = controller();
    await call(ctrl, route, nobody);
    expect(service[route].mock.calls[0][0].scopeSpaceIds).toEqual([]);
  });

  it('the summary flag reaches the service — counts, not a page of shifts', async () => {
    const { ctrl, service } = controller();
    await call(ctrl, 'getPendingApprovals', siteLead);
    expect(service.getPendingApprovals.mock.calls[0][0].summary).toBe(true);
  });

  it('all-entries is bounded — the card asks for a page, the route caps it at 500', async () => {
    const { ctrl, service } = controller();
    await ctrl.getAllEntries(undefined, undefined, undefined, 'CLOCKED_IN', undefined, undefined, 100000, undefined, undefined, { user: admin });
    expect(service.getAllEntries.mock.calls[0][0].limit).toBe(500);
  });

  it('no-shows clamps the window: 1..60 days', async () => {
    const { ctrl, service } = controller();
    await ctrl.listNoShows(9999, undefined, { user: admin });
    await ctrl.listNoShows(1, undefined, { user: admin });
    expect(service.listNoShows.mock.calls[0][0].days).toBe(60);
    expect(service.listNoShows.mock.calls[1][0].days).toBe(1);
  });
});
