/**
 * CustomerConfinementGuard - must be in the gateway due to NestJS DI (Reflector
 * injection only works for a class compiled in this app, like the other guards).
 *
 * Default-DENY for external CUSTOMER accounts: a CUSTOMER holds a valid JWT with
 * a real organizationId, so without this guard they would pass RolesGuard /
 * PermissionsGuard on any endpoint lacking an explicit decorator (both fail-open
 * when undecorated) and reach org data. This confines customers to an allowlist:
 * @Public() routes and @AllowCustomer() routes (the portal + essential auth).
 * Everything else → 403. Staff (ADMIN/EMPLOYEE) are never affected.
 * Registered right after JwtAuthGuard so req.user is populated.
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, IS_CUSTOMER_ALLOWED_KEY, isCustomer } from '@hbcfield/shared';

@Injectable()
export class CustomerConfinementGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const { user } = context.switchToHttp().getRequest();
    // No user / staff → not our concern (other guards handle authz).
    if (!user || !isCustomer(user)) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(IS_CUSTOMER_ALLOWED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    throw new ForbiddenException('This resource is not available to customer accounts');
  }
}
