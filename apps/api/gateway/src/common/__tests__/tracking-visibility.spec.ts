import { trackingVisibility } from '../tracking-visibility';
import { UsersController } from '../../modules/users/users.controller';
import { of } from 'rxjs';

/*
  Coordinates are their own permission. auth-service returns a position only
  when `canViewTracking` is true, so the gateway resolves it from the caller's
  RESOLVED access and sends it — after any query spread, so `?canViewTracking=true`
  can never switch it on.
*/
const user = (extra: any = {}) => ({ id: 'u-1', role: 'EMPLOYEE', organizationId: 'org-1', access: { org: {}, perSpace: {} }, ...extra });

describe('trackingVisibility', () => {
  it('administrator and an org-wide grant see coordinates', () => {
    expect(trackingVisibility(user({ role: 'ADMIN' })).canViewTracking).toBe(true);
    expect(trackingVisibility(user({ access: { org: { canViewTracking: true }, perSpace: {} } })).canViewTracking).toBe(true);
  });
  it('a space grant is listed, but does not open an org-wide list', () => {
    expect(trackingVisibility(user({ access: { org: {}, perSpace: { s1: { canViewTracking: true } } } })))
      .toEqual({ canViewTracking: false, trackingSpaceIds: ['s1'] });
  });
  it('"view all tasks" is not tracking', () => {
    expect(trackingVisibility(user({ canViewAllTasks: true, access: { org: { canViewAllTasks: true }, perSpace: {} } })).canViewTracking).toBe(false);
  });
});

describe('GET /users/workers', () => {
  it('forwards the resolved answer after the query, so a query string cannot set it', async () => {
    const authClient = { send: jest.fn(() => of({ data: [] })) };
    const c = new (UsersController as any)(authClient, {}, {}, {}, {}, {}) as UsersController;
    await c.getWorkers(user({ canViewAllTasks: true }) as any, { canViewTracking: 'true', page: '1' });
    const payload = (authClient.send.mock.calls[0] as any)[1];
    expect(payload.canViewTracking).toBe(false);
    expect(payload.page).toBe('1');
  });
});
