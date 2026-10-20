import { spaceListScope, shapeSpaceList } from '../spaces.controller';

import { fakeUser } from '../../../common/testing/fake-request';
/*
  GET /locations: an external member whose Access Profile said "all" (or who
  carried the org-wide canViewAllTasks column) fell back to the organization's
  whole directory, with each workspace's billable rate on it. Their authority is
  the space role where they are assigned — and the rates are never theirs.
*/
const ext = (extra: any = {}) => ({ id: 'x1', role: 'EMPLOYEE', isExternal: true, ...extra });

describe('GET /locations for an external member', () => {
  it('is narrowed to their own spaces whatever the profile says', () => {
    expect(spaceListScope(ext({ enabledModules: { spaceScope: 'all' } }))).toBe('own');
    expect(spaceListScope(ext({ canViewAllTasks: true }))).toBe('own');
    expect(spaceListScope(ext())).toBe('own');
  });

  it('a profile with no workspace view stays at none', () => {
    expect(spaceListScope(ext({ enabledModules: { spaceScope: 'tasks' } }))).toBe('tasks');
  });

  it('staff keep the rule they had', () => {
    expect(spaceListScope(fakeUser({ id: 'u1', role: 'EMPLOYEE', canViewAllTasks: true }))).toBe('all');
    expect(spaceListScope(fakeUser({ id: 'u1', role: 'EMPLOYEE', enabledModules: { spaceScope: 'own' } }))).toBe('own');
  });

  it('never carries a rate or a cost to them; staff rows unchanged', () => {
    const res = {
      data: [{ id: 's1', name: 'Site', billableRateCents: 5000, costRateCents: 3000 }],
      meta: { total: 1 },
    };
    const out: any = shapeSpaceList(res, ext());
    expect(out.data[0]).toEqual({ id: 's1', name: 'Site' });
    expect(out.meta).toEqual({ total: 1 });
    expect(shapeSpaceList(res, fakeUser({ id: 'u1', role: 'EMPLOYEE' }))).toBe(res);
  });
});
