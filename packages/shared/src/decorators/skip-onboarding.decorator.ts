import { SetMetadata } from '@nestjs/common';

/**
 * Key for storing skip onboarding check metadata
 */
export const IS_SKIP_ONBOARDING_KEY = 'isSkipOnboardingCheck';

/**
 * Decorator to mark a route as accessible by users who haven't completed onboarding.
 * Use this on endpoints that orphan users (no organization) need access to,
 * such as /auth/me, /auth/logout, and all /onboarding/* routes.
 *
 * @example
 * @SkipOnboardingCheck()
 * @Get('me')
 * getProfile() {}
 */
export const SkipOnboardingCheck = () => SetMetadata(IS_SKIP_ONBOARDING_KEY, true);
