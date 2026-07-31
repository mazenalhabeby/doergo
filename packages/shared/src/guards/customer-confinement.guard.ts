/**
 * CustomerConfinementGuard  (global — register in the gateway guard chain)
 *
 * Default-DENY for external CUSTOMER users. A CUSTOMER holds a valid JWT with a
 * real organizationId, so without this guard they would pass RolesGuard /
 * PermissionsGuard on any endpoint that lacks an explicit @Roles/@RequirePermission
 * (both fail-open when undecorated) and reach org data (e.g. chat contacts,
 * org contacts, analytics). This guard confines customers to an ALLOWLIST:
 *
 *   - @Public() routes (no user)
 *   - @AllowCustomer() routes / controllers (the portal + essential auth: me/logout)
 *
 * Everything else → 403 for customers. Staff (ADMIN/EMPLOYEE) are never affected.
 * Register AFTER JwtAuthGuard so req.user is populated.
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, IS_CUSTOMER_ALLOWED_KEY } from '../decorators';
import { isCustomer } from './index';

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
