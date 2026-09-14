import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { INTERNAL_DISPATCH_HEADER, isInternalDispatch } from './internal-dispatch';

/**
 * The global rate limiter, except for a queued operation the gateway is
 * replaying on a phone's behalf — see `internal-dispatch.ts`.
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
}
