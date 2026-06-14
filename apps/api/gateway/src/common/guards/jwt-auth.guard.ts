import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { IS_PUBLIC_KEY } from '@hbcfield/shared';

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
  private readonly redis: Redis;
  private readonly cacheTtl: number;

  constructor(
    private reflector: Reflector,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    config: ConfigService,
  ) {
    this.cacheTtl = Number(config.get('AUTH_CACHE_TTL_SECONDS')) || 60;
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(config.get('REDIS_PORT')) || 6379,
      // Fail fast to the RPC fallback instead of queueing when Redis is down.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    this.redis.on('error', (err) =>
      this.logger.warn(`Auth cache Redis error: ${err.message}`),
    );
  }

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

    const cacheKey = `auth:tok:${createHash('sha256').update(token).digest('hex')}`;

    // ── Cache hit: skip the validate_token RPC + DB read entirely ──
    const cachedUser = await this.readCache(cacheKey);
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

      // Attach user to request and cache the validated user.
      request.user = result.user;
      await this.writeCache(cacheKey, result.user, token);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token validation failed');
    }
  }

  /** Read a cached validated user; never throws (Redis-down → null → RPC). */
  private async readCache(key: string): Promise<any | null> {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  /** Cache the validated user, TTL capped to the token's remaining lifetime. */
  private async writeCache(key: string, user: unknown, token: string): Promise<void> {
    try {
      const exp = this.getTokenExpSeconds(token);
      const remaining = exp ? exp - Math.floor(Date.now() / 1000) : this.cacheTtl;
      const ttl = Math.min(this.cacheTtl, remaining);
      if (ttl > 0) {
        await this.redis.set(key, JSON.stringify(user), 'EX', ttl);
      }
    } catch {
      // Cache write failures must never break auth.
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
