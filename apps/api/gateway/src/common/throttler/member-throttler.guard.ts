import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { INTERNAL_DISPATCH_HEADER, isInternalDispatch } from './internal-dispatch';
import { MEMBER_THROTTLERS } from './throttle-limits';
import { isMemberRequest, memberIdOf, userTracker } from './request-identity';

/**
 * The rate limit for a signed-in member, counted per USER.
 *
 * Registered right AFTER `JwtAuthGuard`, so `req.user` is the validated member —
 * an id read from an unverified token would let anybody mint a fresh bucket per
 * request. Anonymous traffic was already limited per IP by
 * `SyncAwareThrottlerGuard` and is skipped here.
 *
 * Same throttler NAMES as the anonymous family, so a route's own `@Throttle()`
 * (chat 60/min, document upload 30/min, the phone's tracking batch…) applies per
 * member exactly as it did per IP; only the base limits differ
 * (`MEMBER_THROTTLERS`). Keys never collide with the anonymous ones: the tracker
 * is `user:<id>`, not `ip:<address>`.
 */
@Injectable()
export class MemberThrottlerGuard extends ThrottlerGuard {
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    this.throttlers = [...MEMBER_THROTTLERS]
      .sort((a, b) => (a.ttl as number) - (b.ttl as number))
      .map((t) => ({ ...t, name: t.name ?? 'default' }));
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    if (isInternalDispatch(req?.headers?.[INTERNAL_DISPATCH_HEADER])) return true;
    if (!isMemberRequest(context, this.reflector)) return true;
    return memberIdOf(req) === null;
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return userTracker(memberIdOf(req) as string);
  }
}
