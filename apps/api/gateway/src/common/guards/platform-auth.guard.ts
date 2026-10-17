import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  SERVICE_NAMES,
  platformCan,
  platformHostAllowed,
  PLATFORM_2FA_ENROLMENT_REQUIRED,
  type PlatformCapability,
} from '@hbcfield/shared';
import { sendRpc, platformValidateToken } from '@hbcfield/shared/microservices';

const PLATFORM_PERM_KEY = 'platform_required_perm';
const PLATFORM_ENROLMENT_OK_KEY = 'platform_enrolment_ok';

/** Gate a platform route on a capability from the shared RBAC matrix. */
export const RequirePlatformPerm = (cap: PlatformCapability) => SetMetadata(PLATFORM_PERM_KEY, cap);

/**
 * This route is reachable by a session that has not yet enrolled its second
 * factor: who am I, enrol, change password, refresh, sign out. Nothing else.
 */
export const PlatformEnrolmentAllowed = () => SetMetadata(PLATFORM_ENROLMENT_OK_KEY, true);

/**
 * Defence in depth behind nginx: when `PLATFORM_ALLOWED_HOSTS` is set, a
 * platform route answers only on those hosts (admin.hbcfield.com) — a request
 * that reaches the gateway through the public site's proxy is 404, as if the
 * route did not exist. Unset = no restriction (local development).
 */
export function assertPlatformHost(req: { headers?: Record<string, unknown> }): void {
  if (!platformHostAllowed(req.headers?.host, process.env.PLATFORM_ALLOWED_HOSTS)) {
    throw new NotFoundException('Cannot find this route');
  }
}

/** The host rule on its own, for platform routes that do not use a staff session (sign-in, bootstrap). */
@Injectable()
export class PlatformHostGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    assertPlatformHost(ctx.switchToHttp().getRequest());
    return true;
  }
}

/**
 * Verifies the platform-staff Bearer token (separate secret, `typ:'platform'`)
 * via auth-service, attaches `req.platformUser`, and enforces:
 *   - the allowed host (PLATFORM_ALLOWED_HOSTS),
 *   - MANDATORY 2FA: a session whose operator has no second factor reaches only
 *     routes marked `@PlatformEnrolmentAllowed()` — enforced HERE, on the
 *     server, not by the console hiding buttons,
 *   - the route's `@RequirePlatformPerm(...)` against the shared RBAC matrix.
 * Use with `@Public()` so the customer JWT chain is skipped.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_NAMES.AUTH) private readonly authClient: ClientProxy,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    assertPlatformHost(req);
    const header = (req.headers?.authorization as string) || '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Not authenticated');

    const result = await firstValueFrom(sendRpc(this.authClient, platformValidateToken, { token }));
    if (!result?.valid) throw new UnauthorizedException('Invalid or expired session');
    req.platformUser = result.user;
    req.platformPermissions = result.permissions;
    req.platformSession = result.session ?? {};

    const targets = [ctx.getHandler(), ctx.getClass()];
    if (
      result.user?.enrolmentRequired &&
      !this.reflector.getAllAndOverride<boolean>(PLATFORM_ENROLMENT_OK_KEY, targets)
    ) {
      throw new ForbiddenException({
        message: 'Set up two-factor authentication before using the console',
        code: PLATFORM_2FA_ENROLMENT_REQUIRED,
      });
    }

    const cap = this.reflector.getAllAndOverride<PlatformCapability | undefined>(PLATFORM_PERM_KEY, targets);
    if (cap && !platformCan(result.user.role, cap)) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
