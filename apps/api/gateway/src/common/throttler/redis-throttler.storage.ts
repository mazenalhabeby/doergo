import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';

/**
 * The record shape `ThrottlerGuard` expects back. Declared here rather than
 * imported: `@nestjs/throttler` v6 does not re-export `ThrottlerStorageRecord`
 * from its entry point, and reaching into `dist/` for a type is the kind of import
 * that breaks on a patch release.
 */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}
import Redis from 'ioredis';

/**
 * Rate-limit counters in Redis, shared across gateway replicas.
 *
 * The default `ThrottlerStorageService` keeps counters in **process memory**. With
 * one gateway that is correct and fast. With N replicas behind a load balancer it
 * silently multiplies every limit in the product by N — login, forgot-password,
 * invitation-code validation, portal request submission — because each replica
 * counts only the requests that happened to land on it. Nothing fails; the limits
 * just quietly stop meaning what they say.
 *
 * That was the single largest piece of unfinished business the audit found, and it
 * sits directly on the horizontal-scaling path the cron-lock work opened up
 * (`runWithCronLock`): the moment a second replica is worth running, the limits
 * are wrong.
 *
 * **Atomicity.** `INCR` then `EXPIRE` as two round-trips can lose the expiry if the
 * process dies between them, leaving a counter that never resets and locks a client
 * out forever. The whole decision is therefore one Lua script, evaluated on the
 * server.
 *
 * **Failure policy: degrade, never break.** If Redis is unreachable the limiter
 * falls back to a per-process in-memory store — exactly the behaviour that exists
 * today. Failing closed would take the API down because a cache is unavailable;
 * failing fully open would remove rate limiting during precisely the kind of
 * incident where it matters. Falling back keeps a real limit per replica and logs
 * the degradation.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;
  /**
   * Used only while Redis is unreachable. Same class the framework ships.
   * Constructed LAZILY: it registers per-window timers, so creating one on every
   * instance keeps handles alive for a path that normally never runs.
   */
  private fallbackStore?: ThrottlerStorageService;
  private degraded = false;

  /**
   * KEYS[1] hit counter, KEYS[2] block marker.
   * ARGV[1] ttl ms, ARGV[2] limit, ARGV[3] block ms.
   * Returns: totalHits, msToExpire, isBlocked(0|1), msToBlockExpire.
   */
  private static readonly SCRIPT = `
    local blockTtl = redis.call('PTTL', KEYS[2])
    if blockTtl > 0 then
      return { tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('PTTL', KEYS[1]), 1, blockTtl }
    end
    local hits = redis.call('INCR', KEYS[1])
    if hits == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('PTTL', KEYS[1])
    if ttl < 0 then
      -- A counter with no expiry would never reset. Should not happen given the
      -- INCR/PEXPIRE above are one script, but repair it rather than trust it.
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
      ttl = tonumber(ARGV[1])
    end
    if hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
      redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
      return { hits, ttl, 1, tonumber(ARGV[3]) }
    end
    return { hits, ttl, 0, 0 }
  `;

  /**
   * @param client injectable purely so this can be unit-tested. The constructor
   *        otherwise opens a live connection, which would make every test that
   *        merely constructs the class hold an open handle and hang the runner.
   */
  constructor(config: ConfigService, client?: Redis) {
    if (client) {
      this.redis = client;
      return;
    }
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(config.get('REDIS_PORT')) || 6379,
      // Password (H14): omitted unless set, so an open dev Redis still connects.
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    this.redis.on('error', (err) => {
      if (!this.degraded) {
        this.degraded = true;
        this.logger.warn(
          `Throttler Redis unavailable (${err.message}) — falling back to per-process limits. ` +
            'With more than one replica the effective limits are now looser than configured.',
        );
      }
    });
    this.redis.on('ready', () => {
      if (this.degraded) {
        this.degraded = false;
        this.logger.log('Throttler Redis recovered — limits are shared again.');
      }
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:blk:${throttlerName}:${key}`;
    try {
      const [totalHits, msToExpire, isBlocked, msToBlockExpire] =
        (await this.redis.eval(
          RedisThrottlerStorage.SCRIPT,
          2,
          hitKey,
          blockKey,
          String(ttl),
          String(limit),
          String(blockDuration),
        )) as [number, number, number, number];

      return {
        totalHits,
        // The framework reports seconds; the script works in milliseconds so the
        // expiry stays exact under a sub-second TTL (the 'short' throttler is 1s).
        timeToExpire: Math.ceil(msToExpire / 1000),
        isBlocked: isBlocked === 1,
        timeToBlockExpire: Math.ceil(msToBlockExpire / 1000),
      };
    } catch (err) {
      if (!this.degraded) {
        this.degraded = true;
        this.logger.warn(
          `Throttler Redis call failed (${(err as Error).message}) — using per-process limits.`,
        );
      }
      this.fallbackStore ??= new ThrottlerStorageService();
      return this.fallbackStore.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  async onModuleDestroy(): Promise<void> {
    // The in-memory fallback registers a timer per counter window; without this it
    // keeps the process alive after shutdown. Only ever non-null if Redis failed.
    this.fallbackStore?.onApplicationShutdown();
    await this.redis.quit().catch(() => undefined);
  }
}
