import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DENY_EXTERNAL_KEY } from '../decorators/deny-external.decorator';

/**
 * Enforces `@DenyExternal()`.
 *
 * Runs as a global guard so a route carrying the decorator is closed wherever
 * it lives, and costs one metadata lookup on every other route.
 *
 * Reads `isExternal` from the request user — resolved server-side in
 * validateToken from the member's own record, never from anything the client
 * sends.
 */
@Injectable()
export class ExternalMemberGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const denied = this.reflector.getAllAndOverride<boolean>(DENY_EXTERNAL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!denied) return true;

    const user = context.switchToHttp().getRequest()?.user;
    // No user → an earlier guard in the chain owns that decision, not this one.
    if (!user) return true;

    if (user.isExternal === true) {
      throw new ForbiddenException(
        'This belongs to the organization, and is not available to an external member.',
      );
    }
    return true;
  }
}
