import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { SyncOperationResult, SyncTelemetry } from '@hbcfield/shared';

/** A phone that has not reported for this long is no longer counted. */
const REPORT_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Work waiting longer than this is "stuck" for the alert. */
const STUCK_AFTER_MS = 24 * 60 * 60 * 1000;

const HEALTH = (userId: string) => `synchealth:${userId}`;
const INDEX = 'synchealth:index';
const RESULTS = 'synccount:results';

export interface StoredHealth extends SyncTelemetry {
  userId: string;
  organizationId: string;
  receivedAt: number;
}

/**
 * What every phone last said about its queue, and what pushes have come to.
 *
 * Redis, shared by the gateway replicas, and it FAILS OPEN — like the
 * idempotency store and the throttler — because monitoring must never be the
 * reason a member's work is not accepted.
 */
@Injectable()
export class SyncHealthStore implements OnModuleDestroy {
  private readonly logger = new Logger(SyncHealthStore.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(config.get('REDIS_PORT')) || 6379,
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    this.redis.on('error', (err) => this.logger.warn(`Sync health Redis error: ${err.message}`));
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async record(member: { userId: string; organizationId: string }, telemetry: SyncTelemetry, now = Date.now()): Promise<void> {
    // Bounded: the maps come from the phone, and a report is a few numbers, not a store.
    const stored: StoredHealth = {
      ...telemetry,
      byState: boundedCounts(telemetry.byState),
      codes: boundedCounts(telemetry.codes),
      ...member,
      receivedAt: now,
    };
    try {
      await this.redis
        .multi()
        .set(HEALTH(member.userId), JSON.stringify(stored), 'EX', REPORT_TTL_SECONDS)
        .zadd(INDEX, now, member.userId)
        .exec();
    } catch {
      /* fails open */
    }
  }

  async countResults(results: readonly SyncOperationResult[]): Promise<void> {
    if (!results.length) return;
    const counts = new Map<string, number>();
    for (const r of results) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    try {
      const m = this.redis.multi();
      for (const [status, n] of counts) m.hincrby(RESULTS, status, n);
      await m.exec();
    } catch {
      /* fails open */
    }
  }

  /**
   * Prometheus text: phones reporting, work waiting, members with work stuck a
   * day, and push results since the counters began. Per organization where it
   * matters to an operator, never per member (member ids are not labels).
   */
  async metrics(now = Date.now()): Promise<string> {
    let reports: StoredHealth[] = [];
    let results: Record<string, string> = {};
    try {
      const since = now - REPORT_TTL_SECONDS * 1000;
      await this.redis.zremrangebyscore(INDEX, 0, since);
      const userIds = await this.redis.zrange(INDEX, 0, -1);
      if (userIds.length) {
        const raw = await this.redis.mget(userIds.map(HEALTH));
        reports = raw.filter((r): r is string => !!r).map((r) => JSON.parse(r) as StoredHealth);
      }
      results = await this.redis.hgetall(RESULTS);
    } catch {
      /* an empty scrape rather than a failed one */
    }
    return renderMetrics(reports, results, now);
  }
}

/** At most 20 entries with short keys and finite, non-negative counts. */
export function boundedCounts(counts: Record<string, number> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts ?? {}).slice(0, 20)) {
    const n = Number(v);
    if (k.length <= 60 && Number.isFinite(n) && n >= 0) out[k] = Math.floor(n);
  }
  return out;
}

/** A label value as Prometheus requires: backslash, quote and newline escaped. */
const label = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

/** Pure, so the text an alert reads is tested without Redis. */
export function renderMetrics(reports: readonly StoredHealth[], results: Record<string, string>, now: number): string {
  const byOrg = new Map<string, { devices: number; waiting: number; attention: number; stuck: number; bytes: number }>();
  for (const r of reports) {
    const o = byOrg.get(r.organizationId) ?? { devices: 0, waiting: 0, attention: 0, stuck: 0, bytes: 0 };
    o.devices++;
    o.waiting += r.waiting;
    o.attention += r.attention;
    o.bytes += r.bytesWaiting;
    if (r.oldestWaitingAt !== null && now - r.oldestWaitingAt >= STUCK_AFTER_MS) o.stuck++;
    byOrg.set(r.organizationId, o);
  }
  const lines: string[] = [];
  const gauge = (name: string, help: string, pick: (o: { devices: number; waiting: number; attention: number; stuck: number; bytes: number }) => number) => {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
    for (const [org, o] of byOrg) lines.push(`${name}{organization="${label(org)}"} ${pick(o)}`);
  };
  gauge('hbc_offline_devices_reporting', 'Phones that reported their sync queue in the last 30 days', (o) => o.devices);
  gauge('hbc_offline_ops_waiting', 'Operations waiting on phones to be sent', (o) => o.waiting);
  gauge('hbc_offline_ops_attention', 'Operations refused or in conflict, waiting for the member', (o) => o.attention);
  gauge('hbc_offline_members_stuck', 'Members with work unsent for more than a day', (o) => o.stuck);
  gauge('hbc_offline_bytes_waiting', 'Bytes of photos and documents waiting to upload', (o) => o.bytes);
  lines.push('# HELP hbc_sync_push_results_total Pushed operations by result', '# TYPE hbc_sync_push_results_total counter');
  for (const [status, n] of Object.entries(results)) lines.push(`hbc_sync_push_results_total{status="${label(status)}"} ${Number(n) || 0}`);
  return lines.join('\n') + '\n';
}
