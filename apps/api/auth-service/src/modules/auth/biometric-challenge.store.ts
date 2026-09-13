import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * The nonce a phone is asked to sign — issued once, spendable once.
 *
 * ⚠️ Redis, not memory, and that is not an optimisation. Auth-service runs
 * multiple replicas: a nonce issued by one and redeemed by another must be
 * found, or biometric sign-in fails for a random fraction of attempts in a way
 * that looks like a flaky device. An in-memory Map would work perfectly on one
 * machine and be unusable in production.
 *
 * ⚠️ `consume` is atomic (GETDEL). Read-then-delete is a race two requests can
 * both win, which is precisely the replay this exists to prevent.
 */

/** Long enough for a slow prompt on a cold phone, short enough to be useless if captured. */
const CHALLENGE_TTL_SECONDS = 60;

@Injectable()
export class BiometricChallengeStore implements OnModuleDestroy {
  private readonly logger = new Logger(BiometricChallengeStore.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(config.get('REDIS_PORT')) || 6379,
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    this.redis.on('error', (e) => this.logger.warn(`Challenge store Redis error: ${e.message}`));
  }

  private key(deviceId: string): string {
    return `bio:challenge:${deviceId}`;
  }

  /**
   * One outstanding challenge per device: issuing a second replaces the first,
   * so a member who taps twice cannot leave a spare nonce alive behind them.
   */
  async issue(deviceId: string, challenge: string): Promise<void> {
    await this.redis.set(this.key(deviceId), challenge, 'EX', CHALLENGE_TTL_SECONDS);
  }

  /**
   * Take the challenge and destroy it in the same operation.
   *
   * ⚠️ Unlike the grace cache, a Redis failure here must NOT be swallowed into
   * a permissive answer. Returning null on error refuses the sign-in, which is
   * the correct direction to fail: the member falls back to their password.
   */
  async consume(deviceId: string): Promise<string | null> {
    try {
      return await this.redis.getdel(this.key(deviceId));
    } catch (e) {
      this.logger.warn(`Challenge consume failed: ${(e as Error).message}`);
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => {});
  }
}
