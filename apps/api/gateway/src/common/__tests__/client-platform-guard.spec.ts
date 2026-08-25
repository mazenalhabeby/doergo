import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientPlatformGuard } from '../guards/client-platform.guard';

/**
 * The Web / Mobile / Both choice was stored, shown in the Access tab, and
 * enforced nowhere. Closing that gap risks the opposite failure — locking out
 * clients that do not send the header yet — so the permissive paths are pinned
 * as hard as the refusals.
 */
describe('ClientPlatformGuard', () => {
  const guard = new ClientPlatformGuard(new Reflector());
  const ctx = (user: unknown, header?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user, headers: header ? { 'x-client-platform': header } : {} }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  const mobileOnly = { role: 'EMPLOYEE', enabledModules: { modules: ['tasks'], platforms: 'mobile' } };
  const webOnly = { role: 'EMPLOYEE', enabledModules: { modules: ['tasks'], platforms: 'web' } };

  afterEach(() => { delete process.env.ACCESS_REQUIRE_CLIENT_PLATFORM; });

  it('refuses a mobile-only member on the web client', () => {
    expect(() => guard.canActivate(ctx(mobileOnly, 'web'))).toThrow(ForbiddenException);
  });

  it('refuses a web-only member on the mobile client', () => {
    expect(() => guard.canActivate(ctx(webOnly, 'mobile'))).toThrow(ForbiddenException);
  });

  it('allows each on its own client', () => {
    expect(guard.canActivate(ctx(mobileOnly, 'mobile'))).toBe(true);
    expect(guard.canActivate(ctx(webOnly, 'web'))).toBe(true);
  });

  it('allows a member set to both, anywhere', () => {
    const both = { role: 'EMPLOYEE', enabledModules: { platforms: 'both' } };
    expect(guard.canActivate(ctx(both, 'web'))).toBe(true);
    expect(guard.canActivate(ctx(both, 'mobile'))).toBe(true);
  });

  // ── Permissive paths: none of these may be locked out. ──

  it('allows a client that does not identify itself (older mobile builds)', () => {
    expect(guard.canActivate(ctx(mobileOnly))).toBe(true);
  });

  it('ignores an unrecognised platform value rather than refusing', () => {
    expect(guard.canActivate(ctx(mobileOnly, 'desktop'))).toBe(true);
  });

  it('allows an admin on any client', () => {
    expect(guard.canActivate(ctx({ role: 'ADMIN', enabledModules: { platforms: 'mobile' } }, 'web'))).toBe(true);
  });

  it('allows a member with no platform configured', () => {
    expect(guard.canActivate(ctx({ role: 'EMPLOYEE', enabledModules: { modules: ['tasks'] } }, 'web'))).toBe(true);
  });

  it('allows unauthenticated requests through — nothing to check yet', () => {
    expect(guard.canActivate(ctx(undefined, 'web'))).toBe(true);
  });

  it('refuses an unidentified client only once strict mode is switched on', () => {
    process.env.ACCESS_REQUIRE_CLIENT_PLATFORM = 'true';
    expect(() => guard.canActivate(ctx(mobileOnly))).toThrow(ForbiddenException);
  });
});
