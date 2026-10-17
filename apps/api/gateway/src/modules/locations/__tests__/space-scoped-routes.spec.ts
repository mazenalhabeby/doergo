import { ForbiddenException } from '@nestjs/common';
import { locationsControllers, type LocationsControllers } from './locations-controllers.fixture';

import { fakeReq } from '../../../common/testing/fake-request';
/*
  Two routes on `:id` that the space guard could not scope, because the guard
  reads params.spaceId / params.locationId / body.spaceId — never `:id`:

  - POST /locations/:id/members fell back to "granted in ANY space", so a
    member who manages one site could staff (and price) every other;
  - GET /locations/:id forwarded nothing about the caller, so task-service had
    no view scope or management right to narrow on.
*/
const user = (extra: any = {}) => ({
  id: 'u-1',
  role: 'EMPLOYEE',
  organizationId: 'org-1',
  access: { org: {}, perSpace: {} },
  ...extra,
});

function ctrl() {
  const service = { findOne: jest.fn().mockResolvedValue({ data: { id: 'a' } }) };
  const queue = { assignMember: jest.fn().mockResolvedValue({ success: true }) };
  const billing = { rebill: jest.fn() };
  const spaceModules = { invalidate: jest.fn() };
  const c = locationsControllers(service, queue, billing, { nudge: jest.fn() }, spaceModules) as LocationsControllers;
  return { c, service, queue, billing };
}

describe('POST /locations/:id/members — decided on the space in the path', () => {
  it('refuses a manager of ANOTHER space', async () => {
    const { c, queue, billing } = ctrl();
    const req = { user: user({ access: { org: {}, perSpace: { b: { canManageWorkspaces: true } } } }) };
    await expect(c.assignMember('a', { userId: 'x' } as any, fakeReq(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(queue.assignMember).not.toHaveBeenCalled();
    expect(billing.rebill).not.toHaveBeenCalled();
  });

  it('admits the workspace grant here, managing its people here, or an administrator — and re-bills', async () => {
    for (const u of [
      user({ access: { org: {}, perSpace: { a: { canManageWorkspaces: true } } } }),
      user({ access: { org: {}, perSpace: { a: { canManageUsers: true } } } }),
      user({ access: { org: { canManageWorkspaces: true }, perSpace: {} } }),
      user({ role: 'ADMIN' }),
    ]) {
      const { c, queue, billing } = ctrl();
      await c.assignMember('a', { userId: 'x' } as any, fakeReq({ user: u }));
      expect(queue.assignMember).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'a' }));
      expect(billing.rebill).toHaveBeenCalledWith('org-1');
    }
  });
});

describe('GET /locations/:id — forwards who is asking', () => {
  it('an internal member opens the workspace, but its contacts and rates only if they manage it', async () => {
    const { c, service } = ctrl();
    await c.findOne(
      'a',
      fakeReq({
        user: user({ access: { org: {}, perSpace: { a: { canViewAllTasks: true }, b: { canManageUsers: true } } } }),
      }),
    );
    expect(service.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', viewScopeSpaceIds: undefined, mayManage: false }),
    );
  });

  it('an external member is narrowed to the spaces they were given', async () => {
    const { c, service } = ctrl();
    await c.findOne(
      'a',
      fakeReq({ user: user({ isExternal: true, access: { org: {}, perSpace: { a: { canViewAllTasks: true } } } }) }),
    );
    expect(service.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ viewScopeSpaceIds: ['a'], mayManage: false }),
    );
  });

  it('an administrator is not narrowed and manages it', async () => {
    const { c, service } = ctrl();
    await c.findOne('a', fakeReq({ user: user({ role: 'ADMIN' }) }));
    expect(service.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ viewScopeSpaceIds: undefined, mayManage: true }),
    );
  });

  it('an external member granted nowhere sends an EMPTY scope, never an absent one', async () => {
    const { c, service } = ctrl();
    await c.findOne('a', fakeReq({ user: user({ isExternal: true }) }));
    expect(service.findOne.mock.calls[0][0].viewScopeSpaceIds).toEqual([]);
  });
});
