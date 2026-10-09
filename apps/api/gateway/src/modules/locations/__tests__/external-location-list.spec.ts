import { locationListScope, shapeLocationList } from '../locations.controller';

/*
  GET /locations: an external member whose Access Profile said "all" (or who
  carried the org-wide canViewAllTasks column) fell back to the organization's
  whole directory, with each workspace's billable rate on it. Their authority is
  the space role where they are assigned — and the rates are never theirs.
*/
const ext = (extra: any = {}) => ({ id: 'x1', role: 'EMPLOYEE', isExternal: true, ...extra });

describe('GET /locations for an external member', () => {
  it('is narrowed to their own spaces whatever the profile says', () => {
    expect(locationListScope(ext({ enabledModules: { spaceScope: 'all' } }))).toBe('own');
    expect(locationListScope(ext({ canViewAllTasks: true }))).toBe('own');
    expect(locationListScope(ext())).toBe('own');
  });

  it('a profile with no workspace view stays at none', () => {
    expect(locationListScope(ext({ enabledModules: { spaceScope: 'tasks' } }))).toBe('tasks');
  });

  it('staff keep the rule they had', () => {
    expect(locationListScope({ id: 'u1', role: 'EMPLOYEE', canViewAllTasks: true })).toBe('all');
    expect(locationListScope({ id: 'u1', role: 'EMPLOYEE', enabledModules: { spaceScope: 'own' } })).toBe('own');
  });

  it('never carries a rate or a cost to them; staff rows unchanged', () => {
    const res = { data: [{ id: 's1', name: 'Site', billableRateCents: 5000, costRateCents: 3000 }], meta: { total: 1 } };
    const out: any = shapeLocationList(res, ext());
    expect(out.data[0]).toEqual({ id: 's1', name: 'Site' });
    expect(out.meta).toEqual({ total: 1 });
    expect(shapeLocationList(res, { id: 'u1', role: 'EMPLOYEE' })).toBe(res);
  });
});
