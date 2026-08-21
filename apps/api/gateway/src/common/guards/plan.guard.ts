import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, addOnDef, isAddOn, orgHasAddOn, formatCents } from '@hbcfield/shared';
import { PLAN_FEATURE_KEY } from '../decorators/require-plan.decorator';

/**
 * Rejects a premium capability the organization has not bought.
 *
 * This used to ask "does their TIER allow it?" — a rank comparison against a
 * static bundle table, which meant the answer to "can they use invoicing?" was
 * spread across a price list, a tier definition and an ordering. Now it asks the
 * only question that has ever mattered: is it in what they bought.
 *
 * Reads `user.orgAddOns`, resolved server-side by validateToken from
 * Organization.addOns — never a client-supplied claim, and never a value the
 * caller can influence. It is cached with the rest of the auth context for up to
 * AUTH_CACHE_TTL_SECONDS (60s by default), so removing an add-on takes effect
 * within a minute rather than on the next login.
 *
 * FAILS CLOSED on an unknown key. A typo in `@RequirePlan('reccuring')` must
 * 402 and be noticed, not silently grant a paid feature to every organization —
 * which is what an `?? true` or a lookup defaulting to allowed would do.
 *
 * Returns 402 Payment Required (not 403) so the client can tell "you need to buy
 * this" apart from "you are not allowed". Reads (GET/HEAD/OPTIONS) are
 * deliberately NOT gated: removing an add-on must never hard-break viewing data
 * the organization already created.
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
    // Reads never hard-break — only gate mutations.
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const user = req.user;
    if (!user) return true;

    const purchased = Array.isArray(user.orgAddOns) ? (user.orgAddOns as string[]) : [];
    if (isAddOn(feature) && orgHasAddOn(purchased, feature)) return true;

    const def = addOnDef(feature);
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        // Names the thing and its price, so the client can render a real offer
        // instead of "upgrade to Business" — which never said what it cost.
        message: def
          ? `Add ${def.label} (${formatCents(def.monthlyCents)}/month) to use this`
          : 'This feature is not available on your subscription',
        feature,
        addOn: def ? { key: def.key, label: def.label, monthlyCents: def.monthlyCents } : null,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
