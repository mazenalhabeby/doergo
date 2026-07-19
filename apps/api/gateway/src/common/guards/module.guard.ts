import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, minTierForFeature } from '@hbcfield/shared';
import { MODULE_KEY } from '../decorators/require-module.decorator';
import { isFeatureEntitled } from '../entitlements';

/**
 * Rejects mutations whose required FEATURE module is not available to the org —
 * both the plan TIER must entitle it AND the org must have it enabled
 * (`isFeatureEntitled`). Reads planTier/orgModules off the cached token, no DB.
 * Returns 402 (same as PlanGuard) so the upgrade CTA fires consistently.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    // Reads never hard-break on a downgrade — only gate mutations (mirrors PlanGuard).
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const user = req.user;
    if (!user) return true;

    if (!isFeatureEntitled(user, required)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: `The "${required}" feature is not available on your plan.`,
          error: 'PlanUpgradeRequired',
          feature: required,
          requiredTier: minTierForFeature(required),
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
