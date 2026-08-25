import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { canUsePlatform, type AccessPlatform } from '@hbcfield/shared';

/**
 * Enforces the Access Profile's Web / Mobile / Both choice.
 *
 * The setting was stored and displayed but checked nowhere, so "Mobile only"
 * did not stop anyone signing in to the web app.
 *
 * The platform is fixed at LOGIN, where the client declares itself, and stamped
 * into the token as the `plat` claim. This guard reads that claim — not a
 * request header — for two reasons:
 *
 *   • it is signed, so it cannot be dropped or edited to skip the check the way
 *     an X-Client-Platform header could simply be omitted;
 *   • it costs nothing. The claim rides in the token the JwtAuthGuard has
 *     already verified, and the profile it is checked against is already on
 *     req.user, so this adds no query, no crypto and no I/O.
 *
 * Re-checking on every request (rather than trusting the login decision) is what
 * makes revocation quick: an admin switching a member to mobile-only ends their
 * open web session once the gateway's cached user expires — AUTH_CACHE_TTL_SECONDS,
 * 60s by default — rather than whenever the token would have run out.
 *
 * Sessions opened before this shipped carry no claim. They fall back to the
 * header, then to allowing the request — old mobile builds send neither, and
 * failing closed would lock them out on deploy. That window closes as sessions
 * rotate; ACCESS_REQUIRE_CLIENT_PLATFORM=true shuts it immediately.
 */
@Injectable()
export class ClientPlatformGuard implements CanActivate {
  private static parse(raw: unknown): AccessPlatform | null {
    const v = String(raw ?? '').toLowerCase().trim();
    return v === 'web' || v === 'mobile' ? v : null;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (!user) return true; // unauthenticated / public routes — nothing to check yet

    // Signed claim first; header only for sessions minted before it existed.
    const platform =
      ClientPlatformGuard.parse(user.plat) ??
      ClientPlatformGuard.parse(req.headers?.['x-client-platform']);

    if (!platform) {
      if (process.env.ACCESS_REQUIRE_CLIENT_PLATFORM === 'true') {
        throw new ForbiddenException('This session predates platform checks — please sign in again.');
      }
      return true;
    }

    if (!canUsePlatform(user, platform)) {
      throw new ForbiddenException(
        platform === 'web'
          ? 'Your account is set up for the mobile app. Ask an admin to allow web access.'
          : 'Your account is set up for the web app. Ask an admin to allow mobile access.',
      );
    }
    return true;
  }
}
