import { ForbiddenException } from '@nestjs/common';
import type { CurrentUserData } from '@hbcfield/shared';

/**
 * The caller's organization, as a string — for a typed message to a service.
 *
 * `CurrentUserData.organizationId` is `string | null` because a member who has
 * not finished onboarding has none. The global `OnboardingCompleteGuard` refuses
 * every route that is not `@SkipOnboardingCheck()` for such a member, so on those
 * routes this never throws; it exists so the contract's `organizationId: string`
 * is stated once, instead of `!` at every call. On a route that skips the check,
 * do not use it — handle the null.
 */
export function callerOrgId(user: Pick<CurrentUserData, 'organizationId'>): string {
  if (!user.organizationId) throw new ForbiddenException('You are not in an organization yet');
  return user.organizationId;
}
