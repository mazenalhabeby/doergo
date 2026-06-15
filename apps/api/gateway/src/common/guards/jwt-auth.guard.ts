import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { IS_PUBLIC_KEY } from '@hbcfield/shared';
import { AuthTokenCache } from '../cache/auth-token-cache.service';

/**
 * Authenticates every non-public request by validating the access token.
 *
 * Validation (an RPC to auth-service + a Postgres user read) runs on EVERY
 * authenticated request, so we cache the validated user in Redis keyed by a
 * hash of the token. The TTL is short AND capped to the token's own remaining
 * lifetime, so a cached entry can never outlive the token, and role/permission/
 * deactivation changes propagate within at most `AUTH_CACHE_TTL_SECONDS`.
 * If Redis is unavailable we fall back to the RPC transparently.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private reflector: Reflector,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly cache: AuthTokenCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    // ── Cache hit: skip the validate_token RPC + DB read entirely ──
    const cachedUser = await this.cache.get(token);
    if (cachedUser) {
      request.user = cachedUser;
      return true;
    }

    try {
      // Validate token via auth service
      const result = await firstValueFrom(
        this.authClient.send({ cmd: 'validate_token' }, { token }),
      );

      if (!result.valid) {
        throw new UnauthorizedException('Invalid token');
      }

      // Attach user to request and cache the validated user (TTL capped to the
      // token's remaining lifetime so an entry can never outlive its token).
      request.user = result.user;
      const exp = this.getTokenExpSeconds(token);
      const remaining = exp ? exp - Math.floor(Date.now() / 1000) : this.cache.ttl;
      await this.cache.set(token, result.user, Math.min(this.cache.ttl, remaining));
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token validation failed');
    }
  }

  /** Decode (without verifying) the JWT `exp` claim. */
  private getTokenExpSeconds(token: string): number | null {
    try {
      const part = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(part, 'base64').toString());
      return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
      return null;
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
