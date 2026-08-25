import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ClientPlatformGuard } from '../guards/client-platform.guard';

/**
 * The Web / Mobile / Both choice was stored, shown in the Access tab, and
 * enforced nowhere.
 *
 * Enforcement reads the SIGNED `plat` claim rather than a request header, so
 * these tests care about two things: that dropping the header no longer skips
 * the check, and that nothing which works today gets locked out.
 */
describe('ClientPlatformGuard', () => {
  const guard = new ClientPlatformGuard();

  /** `plat` is the signed token claim; `header` is the legacy fallback. */
  const ctx = (user: any, plat?: string, header?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user: user ? { ...user, plat } : user,
          headers: header ? { 'x-client-platform': header } : {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  const mobileOnly = { role: 'EMPLOYEE', enabledModules: { modules: ['tasks'], platforms: 'mobile' } };
  const webOnly = { role: 'EMPLOYEE', enabledModules: { modules: ['tasks'], platforms: 'web' } };

  afterEach(() => { delete process.env.ACCESS_REQUIRE_CLIENT_PLATFORM; });

  it('refuses a mobile-only member on a web session', () => {
    expect(() => guard.canActivate(ctx(mobileOnly, 'web'))).toThrow(ForbiddenException);
  });

  it('refuses a web-only member on a mobile session', () => {
    expect(() => guard.canActivate(ctx(webOnly, 'mobile'))).toThrow(ForbiddenException);
  });

  it('allows each on its own surface', () => {
    expect(guard.canActivate(ctx(mobileOnly, 'mobile'))).toBe(true);
    expect(guard.canActivate(ctx(webOnly, 'web'))).toBe(true);
  });

  it('allows a member set to both, anywhere', () => {
    const both = { role: 'EMPLOYEE', enabledModules: { platforms: 'both' } };
    expect(guard.canActivate(ctx(both, 'web'))).toBe(true);
    expect(guard.canActivate(ctx(both, 'mobile'))).toBe(true);
  });

  // ── The reason for moving off the header ──

  it('still refuses when NO header is sent — the claim is signed, not supplied', () => {
    expect(() => guard.canActivate(ctx(mobileOnly, 'web'))).toThrow(ForbiddenException);
  });

  it('lets the claim win over a header that disagrees with it', () => {
    expect(() => guard.canActivate(ctx(mobileOnly, 'web', 'mobile'))).toThrow(ForbiddenException);
  });

  it('cuts off an open web session as soon as the profile changes', () => {
    // Session was minted as web; the admin has since set the member mobile-only.
    // The guard refuses on the next request whose req.user is fresh (the auth
    // cache holds the old profile for up to AUTH_CACHE_TTL_SECONDS).
    expect(() => guard.canActivate(ctx(mobileOnly, 'web'))).toThrow(ForbiddenException);
  });

  // ── Nothing that works today may be locked out ──

  it('allows a session minted before the claim existed', () => {
    expect(guard.canActivate(ctx(mobileOnly))).toBe(true);
  });

  it('falls back to the header for those older sessions', () => {
    expect(() => guard.canActivate(ctx(mobileOnly, undefined, 'web'))).toThrow(ForbiddenException);
  });

  it('ignores an unrecognised platform value rather than refusing', () => {
    expect(guard.canActivate(ctx(mobileOnly, undefined, 'desktop'))).toBe(true);
  });

  it('allows an admin on any surface', () => {
    expect(guard.canActivate(ctx({ role: 'ADMIN', enabledModules: { platforms: 'mobile' } }, 'web'))).toBe(true);
  });

  it('allows a member with no platform configured', () => {
    expect(guard.canActivate(ctx({ role: 'EMPLOYEE', enabledModules: { modules: ['tasks'] } }, 'web'))).toBe(true);
  });

  it('allows unauthenticated requests through — nothing to check yet', () => {
    expect(guard.canActivate(ctx(undefined, 'web'))).toBe(true);
  });

  it('refuses a claimless session only once strict mode is switched on', () => {
    process.env.ACCESS_REQUIRE_CLIENT_PLATFORM = 'true';
    expect(() => guard.canActivate(ctx(mobileOnly))).toThrow(ForbiddenException);
  });
});
