import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, tierAllows, minTierForFeature, PLANS, type PlanTier } from '@hbcfield/shared';
import { PLAN_FEATURE_KEY } from '../decorators/require-plan.decorator';

/**
 * Rejects requests for a premium capability the org's subscription tier does not
 * include. Reads `user.planTier` carried on the token (set by validateToken from
 * Organization.planTier) — no extra DB hit, O(1) static-table check.
 *
 * Returns 402 Payment Required (not 403) so the client can surface an upgrade CTA
 * distinct from a permission error. Reads (GET/HEAD/OPTIONS) are intentionally NOT
 * gated here — a downgrade should never hard-break viewing existing data; gating
 * lives on the write routes + the UI nav.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const feature = this.reflector.getAllAndOverride<string>(PLAN_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const req = context.switchToHttp().getRequest();
    // Reads never hard-break on a downgrade — only gate mutations.
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const user = req.user;
    if (!user) return true;

    const tier = (user.planTier ?? null) as PlanTier | null;
    if (tierAllows(tier, feature)) return true;

    const needed = minTierForFeature(feature);
    const neededName = needed ? PLANS[needed].name : 'a higher plan';
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        message: `Upgrade to ${neededName} to use this feature`,
        feature,
        requiredTier: needed,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
