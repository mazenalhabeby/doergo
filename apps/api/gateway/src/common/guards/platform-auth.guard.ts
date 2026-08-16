import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { SERVICE_NAMES, platformCan, type PlatformCapability } from '@hbcfield/shared';

export const PLATFORM_PERM_KEY = 'platform_required_perm';
/** Gate a platform route on a capability from the shared RBAC matrix. */
export const RequirePlatformPerm = (cap: PlatformCapability) => SetMetadata(PLATFORM_PERM_KEY, cap);

/**
 * Verifies the platform-staff Bearer token (separate secret, `typ:'platform'`)
 * via auth-service, attaches `req.platformUser`, and enforces the route's
 * `@RequirePlatformPerm(...)` against the shared RBAC matrix. Use with `@Public()`
 * so the customer JWT chain is skipped — these are HBC-staff, not customer, routes.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_NAMES.AUTH) private readonly authClient: ClientProxy,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = (req.headers?.authorization as string) || '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Not authenticated');

    const result = await firstValueFrom(this.authClient.send({ cmd: 'platform_validate_token' }, { token }));
    if (!result?.valid) throw new UnauthorizedException('Invalid or expired session');
    req.platformUser = result.user;
    req.platformPermissions = result.permissions;

    const cap = this.reflector.getAllAndOverride<PlatformCapability | undefined>(PLATFORM_PERM_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (cap && !platformCan(result.user.role, cap)) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
