import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessModuleGuard } from '../guards/access-module.guard';
import { ACCESS_MODULE_KEY } from '@hbcfield/shared';

/**
 * The Access Profile feature tabs used to be presentation only: both clients hid
 * the surface and no endpoint checked it, so a member with Clock switched off
 * could still POST /attendance/clock-in.
 *
 * The risk in closing that hole is the opposite failure — locking out members
 * whose profile was never configured — so these tests pin the fail-open cases
 * as hard as the refusal.
 */
describe('AccessModuleGuard', () => {
  const guard = new AccessModuleGuard(new Reflector());

  const ctx = (user: unknown, required?: string): ExecutionContext => {
    const c = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    jest
      .spyOn(Reflector.prototype, 'getAllAndOverride')
      .mockImplementation((key: string) => (key === ACCESS_MODULE_KEY ? required : undefined) as never);
    return c;
  };

  afterEach(() => jest.restoreAllMocks());

  it('lets the route through when it names no module', () => {
    expect(guard.canActivate(ctx({ role: 'EMPLOYEE', enabledModules: { modules: [] } }))).toBe(true);
  });

  it('refuses a member whose profile excludes the module', () => {
    const user = { role: 'EMPLOYEE', enabledModules: { modules: ['tasks'] } };
    expect(() => guard.canActivate(ctx(user, 'clock'))).toThrow(ForbiddenException);
  });

  it('allows a member whose profile includes it', () => {
    const user = { role: 'EMPLOYEE', enabledModules: { modules: ['tasks', 'clock'] } };
    expect(guard.canActivate(ctx(user, 'clock'))).toBe(true);
  });

  // ── Fail-open cases. Each of these is a member who must NOT be locked out. ──

  it('allows an admin regardless of profile', () => {
    expect(guard.canActivate(ctx({ role: 'ADMIN', enabledModules: { modules: [] } }, 'clock'))).toBe(true);
  });

  it('allows a user with NO profile stored — the pre-Access-Profile majority', () => {
    expect(guard.canActivate(ctx({ role: 'EMPLOYEE' }, 'clock'))).toBe(true);
  });

  it('allows the legacy array storage form', () => {
    expect(guard.canActivate(ctx({ role: 'EMPLOYEE', enabledModules: ['tasks'] }, 'clock'))).toBe(true);
  });

  it('does not throw when there is no authenticated user (public/unauthenticated paths)', () => {
    expect(guard.canActivate(ctx(undefined, 'clock'))).toBe(true);
  });
});
