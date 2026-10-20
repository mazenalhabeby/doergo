import { ForbiddenException } from '@nestjs/common';
import { spacesControllers, type SpacesControllers } from './spaces-controllers.fixture';

import { fakeReq } from '../../../common/testing/fake-request';
/*
  PATCH /locations/:id/members/:assignmentId — decided against the space in the
  PATH (it used to be "canManageWorkspaces in ANY space"):
    • org-wide canManageWorkspaces / admin → any field, not narrowed;
    • canManageWorkspaces in THIS space → any field, narrowed to it;
    • managing this space's people → the automatic-clock choice only, narrowed.
  And the roster hides a colleague's consent from anybody who does not manage it.
*/
const user = (extra: any) => ({
  id: 'u-1',
  role: 'EMPLOYEE',
  organizationId: 'org-1',
  access: { org: {}, perSpace: {} },
  ...extra,
});

function ctrl() {
  const queue = { updateAssignment: jest.fn().mockResolvedValue({ success: true }) };
  const service = { getLocationAssignments: jest.fn() };
  const c = spacesControllers(service, queue, { rebill: jest.fn() }, {}, {}) as SpacesControllers;
  return { c, queue, service };
}

describe('PATCH /locations/:id/members/:assignmentId', () => {
  it('org-wide workspace manager: any field, not narrowed', async () => {
    const { c, queue } = ctrl();
    await c.updateAssignment(
      'a',
      'as1',
      { isPrimary: true } as any,
      fakeReq({ user: user({ access: { org: { canManageWorkspaces: true }, perSpace: {} } }) }),
    );
    expect(queue.updateAssignment.mock.calls[0][0]).toMatchObject({ isPrimary: true, spaceId: undefined });
  });

  it('a space manager may set the automatic-clock choice — narrowed to that space', async () => {
    const { c, queue } = ctrl();
    const mgr = user({ access: { org: {}, perSpace: { a: { canManageUsers: true } } } });
    await c.updateAssignment('a', 'as1', { autoClock: true } as any, fakeReq({ user: mgr }));
    expect(queue.updateAssignment.mock.calls[0][0]).toMatchObject({ autoClock: true, spaceId: 'a' });
  });

  it('…but nothing else, and not in another space', async () => {
    const { c, queue } = ctrl();
    const mgr = user({ access: { org: {}, perSpace: { a: { canManageUsers: true } } } });
    await expect(
      c.updateAssignment('a', 'as1', { autoClock: true, isPrimary: true } as any, fakeReq({ user: mgr })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      c.updateAssignment('b', 'as1', { autoClock: true } as any, fakeReq({ user: mgr })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(queue.updateAssignment).not.toHaveBeenCalled();
  });

  it('…including how they are clocked and their usual hours (the automatic clock as a whole)', async () => {
    const { c, queue } = ctrl();
    const mgr = user({ access: { org: {}, perSpace: { a: { canManageUsers: true } } } });
    await c.updateAssignment(
      'a',
      'as1',
      { autoClockMode: 'PRESENCE', autoClockStartWindow: { from: '19:00', to: '23:00' } } as any,
      fakeReq({ user: mgr }),
    );
    expect(queue.updateAssignment.mock.calls[0][0]).toMatchObject({ autoClockMode: 'PRESENCE', spaceId: 'a' });
    await expect(
      c.updateAssignment(
        'a',
        'as1',
        { autoClockMode: 'PRESENCE', effectiveTo: '2026-12-31' } as any,
        fakeReq({ user: mgr }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('canManageWorkspaces granted in ANOTHER space no longer reaches this one', async () => {
    const { c } = ctrl();
    const other = user({ access: { org: {}, perSpace: { b: { canManageWorkspaces: true } } } });
    await expect(
      c.updateAssignment('a', 'as1', { isPrimary: true } as any, fakeReq({ user: other })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('the roster’s consent column', () => {
  const rows = [{ userId: 'x', autoClock: true, user: { id: 'x', autoClockConsentAt: '2026-09-01T00:00:00.000Z' } }];

  it('reaches whoever manages the space’s people', async () => {
    const { c, service } = ctrl();
    service.getLocationAssignments.mockResolvedValue({ success: true, data: rows });
    const res: any = await c.getLocationMembers('a', fakeReq({ user: user({ role: 'ADMIN' }) }));
    expect(res.data[0].user.autoClockConsentAt).toBe('2026-09-01T00:00:00.000Z');
    expect(res.data[0].autoClock).toBe(true);
  });

  it('is hidden from a colleague (the choice itself stays visible)', async () => {
    const { c, service } = ctrl();
    service.getLocationAssignments.mockResolvedValue({ success: true, data: rows });
    const res: any = await c.getLocationMembers('a', fakeReq({ user: user({}) }));
    expect(res.data[0].user.autoClockConsentAt).toBeUndefined();
    expect(res.data[0].autoClock).toBe(true);
  });
});
