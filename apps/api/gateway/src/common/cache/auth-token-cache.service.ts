import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import Redis from 'ioredis';

/**
 * Redis-backed cache of validated users, keyed by a hash of the access token.
 *
 * It also keeps a per-user index of token-cache-keys so that when a user's
 * profile/permissions change, every cached session for that user can be purged
 * immediately (`invalidateUser`) — letting access changes take effect without
 * the user having to log out and back in.
 *
 * All operations are best-effort: if Redis is unavailable, reads return null
 * and writes/invalidations no-op, so authentication transparently falls back to
 * the validate-token RPC.
 */
@Injectable()
export class AuthTokenCache {
  private readonly logger = new Logger(AuthTokenCache.name);
  private readonly redis: Redis;
  readonly ttl: number;

  constructor(config: ConfigService) {
    this.ttl = Number(config.get('AUTH_CACHE_TTL_SECONDS')) || 60;
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(config.get('REDIS_PORT')) || 6379,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    this.redis.on('error', (err) =>
      this.logger.warn(`Auth cache Redis error: ${err.message}`),
    );
  }

  key(token: string): string {
    return `auth:tok:${createHash('sha256').update(token).digest('hex')}`;
  }

  private userKey(userId: string): string {
    return `auth:usr:${userId}`;
  }

  async get(token: string): Promise<any | null> {
    try {
      const cached = await this.redis.get(this.key(token));
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  /** Cache a validated user for `ttl` seconds and index the key under the user. */
  async set(token: string, user: any, ttl: number): Promise<void> {
    if (ttl <= 0) return;
    try {
      const key = this.key(token);
      await this.redis.set(key, JSON.stringify(user), 'EX', ttl);
      if (user?.id) {
        const uk = this.userKey(user.id);
        await this.redis.sadd(uk, key);
        // Keep the index slightly longer than any single token entry.
        await this.redis.expire(uk, this.ttl + 5);
      }
    } catch {
      // Cache write failures must never break auth.
    }
  }

  /** Purge every cached session for a user (call on profile/permission change). */
  async invalidateUser(userId: string): Promise<void> {
    try {
      const uk = this.userKey(userId);
      const keys = await this.redis.smembers(uk);
      if (keys.length) await this.redis.del(...keys);
      await this.redis.del(uk);
    } catch {
      // Best effort — a stale entry expires within AUTH_CACHE_TTL_SECONDS anyway.
    }
  }
}
