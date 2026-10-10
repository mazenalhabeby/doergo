import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { INTERNAL_DISPATCH_HEADER, isInternalDispatch } from './internal-dispatch';
import { BEARER_FLOOD_NET } from './throttle-limits';
import { ipTracker, isMemberRequest } from './request-identity';

/**
 * The FIRST rate limiter — it runs before the token is validated.
 *
 * - ANONYMOUS requests (no bearer token, or any `@Public()` route): the strict
 *   per-IP limits in `ANONYMOUS_THROTTLERS`, with each route's own `@Throttle()`.
 *   Login, refresh, forgot-password and invitations are limited exactly as before.
 * - A request CARRYING a bearer token to a member route: only the per-IP flood net
 *   (`BEARER_FLOOD_NET`). Its real limit is per USER, applied by
 *   `MemberThrottlerGuard` once `JwtAuthGuard` has said who it is.
 * - A queued operation the gateway is replaying on a phone's behalf is skipped —
 *   see `internal-dispatch.ts`.
 */
@Injectable()
export class SyncAwareThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest();
      if (isInternalDispatch(req?.headers?.[INTERNAL_DISPATCH_HEADER])) return true;
    }
    return super.shouldSkip(context);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (await this.shouldSkip(context)) return true;
    if (isMemberRequest(context, this.reflector)) return this.floodNet(context);
    return super.canActivate(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return ipTracker(req);
  }

  /** One counter per IP across every route; throws 429 past the net. */
  private async floodNet(context: ExecutionContext): Promise<boolean> {
    for (const throttler of BEARER_FLOOD_NET) {
      const ttl = throttler.ttl as number;
      await this.handleRequest({
        context,
        limit: throttler.limit as number,
        ttl,
        blockDuration: ttl,
        throttler,
        getTracker: (req) => ipTracker(req),
        generateKey: (_ctx, tracker, name) =>
          createHash('sha256').update(`bearer-net-${name}-${tracker}`).digest('hex'),
      });
    }
    return true;
  }
}
