import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import Redis from 'ioredis';

/**
 * Seconds until a JWT's `exp` (decoded, NOT verified — callers have already
 * verified it or only need the number to size a TTL). `null` when unreadable.
 */
export function secondsUntilExp(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return typeof payload.exp === 'number' ? payload.exp - Math.floor(Date.now() / 1000) : null;
  } catch {
    return null;
  }
}

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
      // Password (H14): omitted unless set, so open dev Redis still connects.
      password: config.get<string>('REDIS_PASSWORD') || undefined,
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

  /*
    A second index, by ORGANIZATION.

    Some changes are not one person's: switching an Option off changes what every
    member of the organization may see, all at once. Without this the only way to
    apply that was to wait out the TTL — a minute in which the navigation still
    offered Invoices, the page still refused it, and nothing said why.

    A set per organization, written at the same moment as the per-user one, so
    the invalidation costs one `SMEMBERS` and one `DEL` rather than a query for
    every member and a round trip each.
  */
  private orgKey(organizationId: string): string {
    return `auth:org:${organizationId}`;
  }

  /*
    A signed-out access token.

    An access token is a JWT: it stays valid until `exp` whatever happens to the
    session behind it, so "Sign out" ended the refresh token and left the access
    token working for up to JWT_ACCESS_EXPIRATION (15m) — anyone holding a copy
    (a shared machine, a logged request) kept the account for that long.

    So sign-out writes THIS token's hash here, for exactly its remaining
    lifetime. Nothing to clean up: the mark expires the moment the token would
    have anyway, so the set of marks is only ever the tokens signed out in the
    last 15 minutes.
  */
  private revokedKey(token: string): string {
    return `auth:rvk:${createHash('sha256').update(token).digest('hex')}`;
  }

  async get(token: string): Promise<any | null> {
    return (await this.lookup(token)).user;
  }

  /**
   * The cached user AND whether the token was signed out — ONE round trip
   * (`MGET`), so the revocation check costs every request nothing extra.
   *
   * `revoked` wins over a cached user: a request that was mid-validation when
   * the member signed out may still write a cache entry afterwards, and the
   * mark must beat it.
   *
   * Redis down → `{ user: null, revoked: false }`: auth falls back to the RPC as
   * it always has. A revocation therefore relies on Redis being up, which is the
   * same dependency the 60-second cache already has.
   */
  async lookup(token: string): Promise<{ user: any | null; revoked: boolean }> {
    try {
      const [cached, revoked] = await this.redis.mget(this.key(token), this.revokedKey(token));
      return { user: !revoked && cached ? JSON.parse(cached) : null, revoked: !!revoked };
    } catch {
      return { user: null, revoked: false };
    }
  }

  /**
   * Sign this one access token out, for `ttlSeconds` (its remaining lifetime).
   * Also drops its cache entry so nothing serves it from there.
   */
  async revoke(token: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    try {
      await this.redis.set(this.revokedKey(token), '1', 'EX', Math.ceil(ttlSeconds));
      await this.redis.del(this.key(token));
    } catch {
      this.logger.warn('Could not record a signed-out access token (Redis unavailable)');
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
      if (user?.organizationId) {
        const ok = this.orgKey(user.organizationId);
        await this.redis.sadd(ok, key);
        await this.redis.expire(ok, this.ttl + 5);
      }
    } catch {
      // Cache write failures must never break auth.
    }
  }

  /**
   * Purge every cached session in an organization.
   *
   * For a change that is the ORGANIZATION's rather than one member's — the
   * Options it has bought being the reason this exists. Every member sees the
   * result at their next request instead of somewhere inside the next minute.
   *
   * Best effort, like its sibling: a cache that cannot be cleared must not fail
   * the change that cleared it, and the entries expire on their own regardless.
   */
  async invalidateOrganization(organizationId: string): Promise<void> {
    try {
      const ok = this.orgKey(organizationId);
      const keys = await this.redis.smembers(ok);
      if (keys.length) await this.redis.del(...keys);
      await this.redis.del(ok);
    } catch {
      // See invalidateUser.
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
