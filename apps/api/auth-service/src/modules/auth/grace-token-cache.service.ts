import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REFRESH_TOKEN_GRACE_PERIOD_SECONDS } from '@hbcfield/shared';

export interface GraceTokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Short-lived cache of the rotated token pair for the refresh grace window (H7).
 *
 * Previously this pair was written IN THE CLEAR to the RefreshToken row
 * (cachedAccessToken/cachedRefreshToken) and only swept by a 15-min cron, so
 * replayable plaintext tokens sat in Postgres for up to ~15 min — defeating the
 * hash-only storage design. It now lives in Redis with a TTL equal to the grace
 * window, so it self-expires in seconds and never touches the database.
 *
 * Redis is already a hard dependency (bus + queues + auth cache), so this adds no
 * new failure mode. All ops are best-effort: a Redis miss/error just means a
 * concurrent refresh falls through to the existing wait-then-fail path (same
 * behaviour as before the pair was ready) — the FIRST refresh still succeeds.
 */
@Injectable()
export class GraceTokenCache implements OnModuleDestroy {
  private readonly logger = new Logger(GraceTokenCache.name);
  private readonly redis: Redis;
  private readonly ttl: number;

  constructor(config: ConfigService) {
    this.ttl = REFRESH_TOKEN_GRACE_PERIOD_SECONDS;
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(config.get('REDIS_PORT')) || 6379,
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    this.redis.on('error', (e) => this.logger.warn(`Grace cache Redis error: ${e.message}`));
  }

  private key(tokenId: string): string {
    return `grace:${tokenId}`;
  }

  async put(tokenId: string, pair: GraceTokenPair): Promise<void> {
    try {
      await this.redis.set(this.key(tokenId), JSON.stringify(pair), 'EX', this.ttl);
    } catch (e) {
      // First refresh still returns its tokens; only concurrent duplicates degrade.
      this.logger.warn(`Grace cache put failed: ${(e as Error).message}`);
    }
  }

  async get(tokenId: string): Promise<GraceTokenPair | null> {
    try {
      const v = await this.redis.get(this.key(tokenId));
      return v ? (JSON.parse(v) as GraceTokenPair) : null;
    } catch (e) {
      this.logger.warn(`Grace cache get failed: ${(e as Error).message}`);
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
