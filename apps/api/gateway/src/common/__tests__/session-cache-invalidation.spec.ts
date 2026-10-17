import { of } from 'rxjs';
import { EmployeesController } from '../../modules/technicians/technicians.controller';
import { AuthSessionsController } from '../../modules/auth/auth-sessions.controller';

/*
  The gateway caches who a session belongs to. A member switched off, or an
  account whose other sessions were just revoked, kept being answered from that
  cache until it expired. Each of these now drops it on success.
*/
const caller = { id: 'admin-1', role: 'ADMIN', organizationId: 'org-1' } as any;

describe('employee deactivation and edits', () => {
  function ctrl() {
    const authClient = { send: jest.fn(() => of({ success: true })) };
    const authCache = { invalidateUser: jest.fn(async () => undefined) };
    const c = new (EmployeesController as any)(authClient, { rebill: jest.fn() }, authCache, {}) as EmployeesController;
    return { c, authCache };
  }

  it('DELETE drops the deactivated member\'s cached sessions', async () => {
    const { c, authCache } = ctrl();
    await c.deactivateEmployee('m-1', caller);
    expect(authCache.invalidateUser).toHaveBeenCalledWith('m-1');
  });

  it('PATCH { isActive: false } does too', async () => {
    const { c, authCache } = ctrl();
    await c.updateEmployee('m-1', { isActive: false } as any, caller);
    expect(authCache.invalidateUser).toHaveBeenCalledWith('m-1');
  });
});

describe('DELETE /auth/sessions', () => {
  it('sends the caller\'s own refresh token so their session can be kept, and drops their cache', async () => {
    const authClient = { send: jest.fn(() => of({ success: true, data: { revoked: 2 } })) };
    const authCache = { invalidateUser: jest.fn(async () => undefined) };
    const c = new AuthSessionsController(authClient as any, authCache as any);
    await c.revokeAllSessions({ id: 'u-1' } as any, { cookies: { refreshToken: 'rt-cookie' } } as any, {} as any);
    expect(authClient.send).toHaveBeenCalledWith({ cmd: 'revoke_all_sessions' }, { userId: 'u-1', currentRefreshToken: 'rt-cookie' });
    expect(authCache.invalidateUser).toHaveBeenCalledWith('u-1');
  });

  it('the phone sends it in the body', async () => {
    const authClient = { send: jest.fn(() => of({ success: true })) };
    const c = new AuthSessionsController(authClient as any, { invalidateUser: jest.fn(async () => undefined) } as any);
    await c.revokeAllSessions({ id: 'u-1' } as any, { cookies: {} } as any, { refreshToken: 'rt-body' } as any);
    expect((authClient.send.mock.calls[0] as any)[1].currentRefreshToken).toBe('rt-body');
  });
});
