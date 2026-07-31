/**
 * CustomerScopeGuard
 *
 * Gate for customer-portal endpoints. Asserts the caller is an external CUSTOMER
 * bound to a Customer record. It does NOT decide *which* records they can see —
 * that isolation is enforced in the service layer, which always filters by the
 * caller's own `customerId` (read from the verified token, never from the body).
 * This guard just keeps staff out of portal routes and portal users off staff
 * routes when combined with @Roles.
 *
 * Skipped for @Public() routes (no authenticated user to check).
 *
 * Note: registered per-app due to NestJS DI; the shared package owns the impl.
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators';
import { isCustomer } from './index';

@Injectable()
export class CustomerScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!isCustomer(user)) {
      throw new ForbiddenException('Customer portal access only');
    }

    // A portal user MUST be bound to a Customer — otherwise there is nothing to
    // scope to and we fail closed rather than risk leaking cross-customer data.
    if (!user.customerId) {
      throw new ForbiddenException('No customer profile linked to this account');
    }

    // Fail closed if the org has turned the portal off — disabling it must
    // actually revoke access, not just hide the config. (customerPortalEnabled
    // is refreshed on the token by validateToken.)
    if (user.customerPortalEnabled === false) {
      throw new ForbiddenException('The customer portal is not available');
    }

    return true;
  }
}
