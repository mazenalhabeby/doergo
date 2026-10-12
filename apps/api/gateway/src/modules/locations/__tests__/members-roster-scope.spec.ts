import { mayViewSpaceRoster, mayManageSpaceMembers, stripSpaceTerms } from '@hbcfield/shared';
import { LocationsController } from '../locations.controller';

/*
  GET /locations/:id/members had no gate. It now carries the caller's scope to
  the service (which refuses a space outside it) and strips a member's bill
  rate unless the caller manages that space's people.
*/
const user = (extra: any) => ({ id: 'u-1', role: 'EMPLOYEE', organizationId: 'org-1', access: { org: {}, perSpace: {} }, ...extra });

describe('roster access rules', () => {
  it('an external member reads a roster only through a grant IN that space', () => {
    const supervisor = user({ isExternal: true, access: { org: {}, perSpace: { a: { canViewSpaceAttendance: true } } } });
    expect(mayViewSpaceRoster(supervisor, 'a')).toBe(true);
    expect(mayViewSpaceRoster(supervisor, 'b')).toBe(false);
    // The legacy column never widens an external member to every space.
    expect(mayViewSpaceRoster(user({ isExternal: true, canViewAllTasks: true }), 'b')).toBe(false);
  });
  it('whoever hands equipment over in a workspace sees its people — there, and only there', () => {
    const keeper = user({ isExternal: true, access: { org: {}, perSpace: { a: { canManageAssets: true } } } });
    expect(mayViewSpaceRoster(keeper, 'a')).toBe(true);
    expect(mayViewSpaceRoster(keeper, 'b')).toBe(false);
  });
  it('bill rates leave only for whoever manages that space\'s people', () => {
    const rows = [{ userId: 'x', billRateCents: 9000, isPrimary: true }];
    expect(stripSpaceTerms(rows, false)).toEqual([{ userId: 'x', isPrimary: true }]);
    expect(stripSpaceTerms(rows, true)).toEqual(rows);
    expect(mayManageSpaceMembers(user({ access: { org: {}, perSpace: { a: { canManageUsers: true } } } }), 'a')).toBe(true);
    expect(mayManageSpaceMembers(user({}), 'a')).toBe(false);
    expect(mayManageSpaceMembers({ role: 'ADMIN' }, 'a')).toBe(true);
  });
});

describe('LocationsController.getLocationMembers', () => {
  function ctrl(rows: any[]) {
    const service = { getLocationAssignments: jest.fn().mockResolvedValue({ success: true, data: rows }) };
    const c = new (LocationsController as any)(service, {}, {}, {});
    return { c: c as LocationsController, service };
  }

  it('forwards requester, Access-Profile scope and the per-space grant', async () => {
    const { c, service } = ctrl([]);
    await c.getLocationMembers('a', { user: user({}) });
    expect(service.getLocationAssignments.mock.calls[0][0]).toMatchObject({ requesterId: 'u-1', spaceScope: 'all', canViewAll: false });
  });

  it('an external member gets no "own"/"all" path', async () => {
    const { c, service } = ctrl([]);
    await c.getLocationMembers('a', { user: user({ isExternal: true }) });
    expect(service.getLocationAssignments.mock.calls[0][0].spaceScope).toBe('tasks');
  });

  it('strips the bill rate for a colleague', async () => {
    const { c } = ctrl([{ userId: 'x', billRateCents: 9000 }]);
    const res: any = await c.getLocationMembers('a', { user: user({}) });
    expect(res.data[0].billRateCents).toBeUndefined();
  });
});

describe('LocationsController.getRosters (dashboard batch) — same per-space rule', () => {
  function ctrl(rows: any[]) {
    const service = { getLocationAssignmentsBatch: jest.fn().mockResolvedValue({ success: true, data: rows }) };
    const c = new (LocationsController as any)(service, {}, {}, {});
    return { c: c as LocationsController, service };
  }

  it('an external member: no own/all path, viewing grant asked per space', async () => {
    const { c, service } = ctrl([]);
    const supervisor = user({ isExternal: true, canViewAllTasks: true, access: { org: {}, perSpace: { a: { canViewSpaceAttendance: true } } } });
    await c.getRosters('a,b', { user: supervisor });
    const sent = service.getLocationAssignmentsBatch.mock.calls[0][0];
    expect(sent.spaceScope).toBe('tasks');
    expect(sent.viewAllIds).toEqual(['a']);
    // The org-wide boolean that let the legacy column read every roster is gone.
    expect(sent.canViewAll).toBeUndefined();
  });

  it('an internal member keeps their Access-Profile scope; grants are per space', async () => {
    const { c, service } = ctrl([]);
    await c.getRosters('a,b', { user: user({ access: { org: {}, perSpace: { b: { canAssignTasks: true } } } }) });
    expect(service.getLocationAssignmentsBatch.mock.calls[0][0]).toMatchObject({ spaceScope: 'all', viewAllIds: ['b'] });
  });

  it('strips a bill rate per row, keeping it only where the caller manages that space', async () => {
    const { c } = ctrl([
      { userId: 'x', locationId: 'a', billRateCents: 9000 },
      { userId: 'y', locationId: 'b', billRateCents: 7000 },
    ]);
    const mgr = user({ access: { org: {}, perSpace: { a: { canManageUsers: true } } } });
    const res: any = await c.getRosters('a,b', { user: mgr });
    expect(res.data[0].billRateCents).toBe(9000);
    expect(res.data[1].billRateCents).toBeUndefined();
  });
});
