import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, isLocked, isCustomer } from '@hbcfield/shared';
import type { SubStatus } from '@hbcfield/shared';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Enforces the billing read-only lock. When an org's subscription is locked
 * (trial ended with no payment → INCOMPLETE, or CANCELED past period end) all
 * WRITE operations are blocked with 402, while reads stay allowed so the team
 * keeps access to its data. Billing + auth routes are always allowed so an admin
 * can pay to unlock.
 *
 * PERFORMANCE: reads `user.subStatus` carried on the cached token — no DB/Stripe
 * call per request. SECURITY: enforced server-side, not just hidden in the UI.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const method = String(req.method || 'GET').toUpperCase();
    if (READ_ONLY_METHODS.has(method)) return true; // reads always allowed

    const user = req.user;
    if (!user?.subStatus) return true; // not enriched (older token) → don't hard-fail
    if (!isLocked(user.subStatus as SubStatus)) return true;

    const path: string = req.path || req.url || '';
    // Billing + auth always allowed so an admin can pay to unlock.
    if (path.includes('/billing') || path.includes('/auth/')) return true;
    // Exempt the customer portal ONLY for external customers — they aren't the
    // billing party and must not see the org's billing state or have intake
    // broken. Staff routes (incl. /portal/admin config writes) stay locked.
    if (isCustomer(user) && path.includes('/portal')) return true;

    throw new HttpException(
      {
        message: 'Your subscription is inactive. An admin must add a payment method to continue.',
        code: 'SUBSCRIPTION_INACTIVE',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
