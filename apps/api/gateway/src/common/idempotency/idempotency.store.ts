import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** A remembered request: running, or finished with the answer it gave. */
export type IdempotencyEntry =
  | { state: 'running'; hash: string }
  | { state: 'done'; hash: string; status: number; body: unknown };

/** How long a finished answer is remembered. A phone offline for a week still retries safely. */
export const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;
/** How long a claim may stay "running" before a retry is allowed to run it again. */
export const IDEMPOTENCY_LOCK_SECONDS = 120;

/**
 * Where idempotency keys live: Redis, shared by every gateway replica, so a
 * retry that lands on another replica still sees the first attempt.
 *
 * ⚠️ Fails OPEN. Redis unreachable means a request runs without the guarantee
 * rather than being refused — the same trade the throttler and auth cache make.
 * The second line of defence is the domain: records created from the phone carry
 * their own ids, so a duplicate there is an upsert, not a second row.
 */
@Injectable()
export class IdempotencyStore implements OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyStore.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(config.get('REDIS_PORT')) || 6379,
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', (err) => this.logger.warn(`Idempotency Redis error: ${err.message}`));
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  private key(userId: string, key: string) {
    return `idem:${userId}:${key}`;
  }

  /**
   * Try to become the one execution for this key.
   *
   * Returns `claimed` when this request should run, the stored entry when one
   * already exists, or `unavailable` when Redis cannot answer.
   */
  async claim(
    userId: string,
    key: string,
    hash: string,
    attempt = 0,
  ): Promise<{ claimed: true } | { claimed: false; entry: IdempotencyEntry } | { unavailable: true }> {
    try {
      const value: IdempotencyEntry = { state: 'running', hash };
      const ok = await this.redis.set(this.key(userId, key), JSON.stringify(value), 'EX', IDEMPOTENCY_LOCK_SECONDS, 'NX');
      if (ok === 'OK') return { claimed: true };
      const raw = await this.redis.get(this.key(userId, key));
      // Expired between SET and GET: take it.
      if (!raw) return attempt < 2 ? this.claim(userId, key, hash, attempt + 1) : { unavailable: true };
      return { claimed: false, entry: JSON.parse(raw) as IdempotencyEntry };
    } catch {
      return { unavailable: true };
    }
  }

  async complete(userId: string, key: string, entry: Extract<IdempotencyEntry, { state: 'done' }>): Promise<void> {
    try {
      await this.redis.set(this.key(userId, key), JSON.stringify(entry), 'EX', IDEMPOTENCY_TTL_SECONDS);
    } catch {
      /* fail open — see class note */
    }
  }

  /** Forget a claim so a retry runs again (the attempt failed). */
  async release(userId: string, key: string): Promise<void> {
    try {
      await this.redis.del(this.key(userId, key));
    } catch {
      /* the lock expires on its own */
    }
  }
}
