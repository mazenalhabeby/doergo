import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canUsePlatform, type AccessPlatform } from '@hbcfield/shared';

/**
 * Enforces the Access Profile's Web / Mobile / Both choice.
 *
 * The setting was stored and displayed but checked nowhere, so "Mobile only"
 * did not stop anyone signing in to the web app.
 *
 * Clients identify themselves with `X-Client-Platform: web | mobile`.
 *
 * A request that does NOT identify itself is allowed through by default, and
 * that is deliberate: mobile builds already installed do not send the header,
 * and failing closed would lock every one of them out at the moment this
 * deploys. Until those builds are updated the control therefore binds
 * cooperating clients only — anyone who omits the header is not stopped.
 * Set ACCESS_REQUIRE_CLIENT_PLATFORM=true once the fleet has caught up, and an
 * unidentified request is refused instead.
 */
@Injectable()
export class ClientPlatformGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  private static parse(raw: unknown): AccessPlatform | null {
    const v = String(raw ?? '').toLowerCase().trim();
    return v === 'web' || v === 'mobile' ? v : null;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (!user) return true; // unauthenticated / public routes — nothing to check yet

    const client = ClientPlatformGuard.parse(req.headers?.['x-client-platform']);

    if (!client) {
      if (process.env.ACCESS_REQUIRE_CLIENT_PLATFORM === 'true') {
        throw new ForbiddenException('This client must identify its platform.');
      }
      return true;
    }

    if (!canUsePlatform(user, client)) {
      throw new ForbiddenException(
        client === 'web'
          ? 'Your account is set up for the mobile app. Ask an admin to allow web access.'
          : 'Your account is set up for the web app. Ask an admin to allow mobile access.',
      );
    }
    return true;
  }
}
