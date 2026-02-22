/**
 * OnboardingCompleteGuard - must be in gateway due to NestJS DI requirements
 * Ensures users have completed onboarding before accessing protected endpoints.
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, IS_SKIP_ONBOARDING_KEY } from '@doergo/shared';

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
