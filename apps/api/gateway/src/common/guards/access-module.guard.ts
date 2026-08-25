import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_MODULE_KEY, IS_PUBLIC_KEY, hasAccessModule, type MobileModule } from '@hbcfield/shared';

/**
 * Enforces the member's Access Profile feature tabs (tasks / clock / time_off).
 *
 * Before this guard the tabs were presentation only: both clients hid the
 * surface, no endpoint checked it. An admin who switched Clock off for a member
 * had changed the navigation, not their access.
 *
 * Fails OPEN by design for anyone the profile does not describe — hasAccessModule
 * returns true for admins and for users with no stored profile — so switching
 * this on cannot lock out an existing member whose profile was never configured.
 */
@Injectable()
export class AccessModuleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<MobileModule>(ACCESS_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return true;

    if (!hasAccessModule(user, required)) {
      throw new ForbiddenException(
        `Your access profile does not include the ${required.replace('_', ' ')} feature.`,
      );
    }
    return true;
  }
}
