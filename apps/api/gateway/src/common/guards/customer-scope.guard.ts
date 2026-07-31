/**
 * CustomerScopeGuard - local to the gateway (NestJS DI: Reflector injection only
 * works for a class compiled in this app, like the other guards).
 *
 * Gate for customer-portal endpoints. Asserts the caller is an external CUSTOMER
 * bound to a Customer, and that the org's portal is enabled. It does NOT decide
 * *which* records they can see — that isolation is enforced in the service layer,
 * which always filters by the caller's own customerId (from the verified token).
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, isCustomer } from '@hbcfield/shared';

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
    // A portal user MUST be bound to a Customer — fail closed otherwise.
    if (!user.customerId) {
      throw new ForbiddenException('No customer profile linked to this account');
    }
    // Disabling the portal must actually revoke access, not just hide the config.
    if (user.customerPortalEnabled === false) {
      throw new ForbiddenException('The customer portal is not available');
    }
    return true;
  }
}
