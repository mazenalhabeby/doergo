import { ForbiddenException } from '@nestjs/common';
import { ExternalMemberGuard } from '../external-member.guard';

/**
 * An external supervisor could list the organization's assets.
 *
 * Not through a missing check — through a permission that is genuinely theirs.
 * `GET /assets` is gated on `canViewAllTasks`, which an external supervisor
 * holds IN their space because it is how they follow the work they are there to
 * supervise. One permission was doing duty for two different things, so granting
 * the first granted the second.
 *
 * A permission ceiling cannot fix that. The RELATIONSHIP disqualifies them, and
 * that is what this guard states.
 */
describe('org property is closed to an external member', () => {
  const ctx = (user: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as any;

  const guard = (denied: boolean) =>
    new ExternalMemberGuard({ getAllAndOverride: () => denied } as any);

  it('refuses an external member holding every permission in their space', () => {
    expect(() =>
      guard(true).canActivate(ctx({ isExternal: true, canViewAllTasks: true })),
    ).toThrow(ForbiddenException);
  });

  it('lets our own staff through, external flag absent or false', () => {
    expect(guard(true).canActivate(ctx({ isExternal: false }))).toBe(true);
    expect(guard(true).canActivate(ctx({}))).toBe(true);
  });

  it('leaves every undecorated route alone', () => {
    // The cost on the rest of the API is one metadata lookup.
    expect(guard(false).canActivate(ctx({ isExternal: true }))).toBe(true);
  });

  it('defers to the earlier guards when there is no user', () => {
    // Public / unauthenticated routes are not this guard's decision to make.
    expect(guard(true).canActivate(ctx(undefined))).toBe(true);
  });

  it('matches on the boolean only, never a truthy string', () => {
    expect(() => guard(true).canActivate(ctx({ isExternal: true }))).toThrow();
    expect(guard(true).canActivate(ctx({ isExternal: 'false' }))).toBe(true);
  });
});
