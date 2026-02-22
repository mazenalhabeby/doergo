/**
 * OnboardingCompleteGuard
 *
 * Global guard that ensures users have completed onboarding before accessing
 * protected endpoints. Returns 403 if user.onboardingCompleted is false.
 *
 * Skipped when:
 * - Route is marked @Public() (no auth required, so no user to check)
 * - Route is marked @SkipOnboardingCheck()
 *
 * Note: Must be defined in the gateway app due to NestJS DI requirements.
 * This file provides the implementation to be used there.
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators';
import { IS_SKIP_ONBOARDING_KEY } from '../decorators/skip-onboarding.decorator';

@Injectable()
export class OnboardingCompleteGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip for @Public() routes (no auth, so no user)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Skip for @SkipOnboardingCheck() routes
    const skipOnboarding = this.reflector.getAllAndOverride<boolean>(IS_SKIP_ONBOARDING_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipOnboarding) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // No user = let other guards handle it
    if (!user) {
      return true;
    }

    // Check if onboarding is completed
    if (user.onboardingCompleted === false) {
      throw new ForbiddenException('Please complete onboarding first');
    }

    return true;
  }
}
