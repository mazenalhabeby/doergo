import { holds, holdsOrgWide, oversees } from '../permissions';
import { manageRowsFor, hasManageSurface } from '../manage-rows';
import { isMyRouteStop, hasRouteToPlan } from '../my-route';

/**
 * What the mobile app decides on its own.
 *
 * These three rules govern which screens exist for a member, and until now they
 * were verified by typecheck and by looking at a phone. Each answers a question
 * the server also answers — so when they disagree, a member is either shown a
 * wall of refusals or denied something they hold.
 */

const admin = { role: 'ADMIN' };
const orgManager = {
  role: 'EMPLOYEE',
  canManageUsers: true,
  canViewAllTasks: true,
  access: { org: { canManageUsers: true, canViewAllTasks: true }, perSpace: {} },
};
/** The case all of this exists for: authority from one space, none org-wide. */
const supervisor = {
  role: 'EMPLOYEE',
  access: {
    org: {},
    perSpace: {
      s1: {
        canViewAllTasks: true,
        canViewSpaceAttendance: true,
        canApproveOvertime: true,
        canReconcileAttendance: true,
      },
    },
  },
};
const worker = { role: 'EMPLOYEE', access: { org: {}, perSpace: {} } };

describe('holding a permission', () => {
  it('an admin holds everything by being one', () => {
    // Not by carrying flags: a built-in role's stored permissions are a
    // snapshot and never gain keys added to the catalogue afterwards.
    expect(holds(admin, 'canReconcileAttendance')).toBe(true);
    expect(holdsOrgWide(admin, 'canManageUsers')).toBe(true);
  });

  it('a flat column counts', () => {
    expect(holds(orgManager, 'canManageUsers')).toBe(true);
  });

  it('a grant held in ONE space counts for `holds` — the whole point', () => {
    expect(holds(supervisor, 'canViewSpaceAttendance')).toBe(true);
  });

  it('and does NOT count for `holdsOrgWide`', () => {
    // `@RequirePermission` reads the flat/org resolution, so offering an
    // org-wide screen on a space grant is a tab full of 403s.
    expect(holdsOrgWide(supervisor, 'canViewSpaceAttendance')).toBe(false);
    expect(holdsOrgWide(supervisor, 'canManageUsers')).toBe(false);
  });

  it('nobody holds anything by default', () => {
    expect(holds(worker, 'canViewSpaceAttendance')).toBe(false);
    expect(holds(null, 'canViewAllTasks')).toBe(false);
    expect(holds(undefined, 'canViewAllTasks')).toBe(false);
  });

  it('overseeing is "sees everyone\'s work", wherever that is held', () => {
    expect(oversees(supervisor)).toBe(true);
    expect(oversees(orgManager)).toBe(true);
    expect(oversees(admin)).toBe(true);
    expect(oversees(worker)).toBe(false);
  });
});

describe('what Manage offers', () => {
  const keys = (user: unknown) => manageRowsFor(user as never).map((r) => r.labelKey);

  it('gives an admin the whole list', () => {
    expect(keys(admin).length).toBeGreaterThanOrEqual(7);
  });

  it('gives a space supervisor the space-scoped rows, and only those', () => {
    const rows = keys(supervisor);
    expect(rows).toContain('manage.attendance.label');
    expect(rows).toContain('manage.extraTime.label');
    expect(rows).toContain('manage.issues.label');
    // Members, invitations and join requests are org-wide columns: the server
    // refuses a space role however senior, so the row must not be offered.
    expect(rows).not.toContain('manage.members.label');
    expect(rows).not.toContain('manage.invitations.label');
    expect(rows).not.toContain('manage.joinRequests.label');
  });

  it('gives a field worker nothing, so the tab does not appear', () => {
    expect(keys(worker)).toEqual([]);
    expect(hasManageSurface(worker as never)).toBe(false);
  });

  it('shows the tab to anyone with at least one row', () => {
    expect(hasManageSurface(supervisor as never)).toBe(true);
    expect(hasManageSurface(admin as never)).toBe(true);
  });
});

describe('planning my route', () => {
  const me = 'u1';
  const job = (over: Record<string, unknown> = {}) =>
    ({
      id: 't1',
      status: 'ASSIGNED',
      assignedToId: me,
      locationLat: 47.98,
      locationLng: 13.82,
      ...over,
    }) as never;

  it('counts an open job assigned to me with somewhere to be', () => {
    expect(isMyRouteStop(job(), me)).toBe(true);
  });

  it('ignores somebody else\'s job — the bug that planned the whole site', () => {
    expect(isMyRouteStop(job({ assignedToId: 'other' }), me)).toBe(false);
  });

  it('ignores a finished job', () => {
    for (const status of ['COMPLETED', 'CLOSED', 'CANCELED']) {
      expect(isMyRouteStop(job({ status }), me)).toBe(false);
    }
  });

  it('ignores a job with no place to drive to', () => {
    expect(isMyRouteStop(job({ locationLat: undefined, locationLng: undefined }), me)).toBe(false);
  });

  it('offers the banner only when there is a route to plan', () => {
    expect(hasRouteToPlan([job()], me)).toBe(true);
    expect(hasRouteToPlan([job({ assignedToId: 'other' })], me)).toBe(false);
    expect(hasRouteToPlan([], me)).toBe(false);
    // A supervisor: everything on their list belongs to somebody else.
    expect(hasRouteToPlan([job({ assignedToId: 'a' }), job({ assignedToId: 'b' })], me)).toBe(false);
  });

  it('answers false with no signed-in user rather than guessing', () => {
    expect(hasRouteToPlan([job()], undefined)).toBe(false);
  });

  /*
    A pin is not a journey. This is the case that motivated the rule: a task
    can carry a real address and belong to a flow with no travel step — a
    support ticket with the customer's address on it — and a route built from
    coordinates alone put it on somebody's driving list.
  */
  it('ignores a job whose flow has no travel step, address or not', () => {
    expect(isMyRouteStop(job({ tracksLocation: false }), me)).toBe(false);
    expect(hasRouteToPlan([job({ tracksLocation: false })], me)).toBe(false);
  });

  it('counts a job whose flow does travel', () => {
    expect(isMyRouteStop(job({ tracksLocation: true }), me)).toBe(true);
  });

  it('withholds the banner when every job is desk work', () => {
    const deskWork = [
      job({ id: 'a', tracksLocation: false }),
      job({ id: 'b', tracksLocation: false }),
    ];
    expect(hasRouteToPlan(deskWork, me)).toBe(false);
    // One travelling job among them is enough to make a route worth planning.
    expect(hasRouteToPlan([...deskWork, job({ id: 'c', tracksLocation: true })], me)).toBe(true);
  });

  /*
    ⚠️ Absent must read as YES. The app updates over the air and may be talking
    to a gateway that predates the field; treating a missing answer as "no"
    would take the button away from every field worker at once, everywhere,
    with nothing on screen to explain it.
  */
  it('keeps the old behaviour when the server does not send the field', () => {
    expect(isMyRouteStop(job(), me)).toBe(true);
    expect(isMyRouteStop(job({ tracksLocation: undefined }), me)).toBe(true);
  });
});
