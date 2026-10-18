import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import {
  CLOCK_PUSH_DAILY_BUDGET,
  CLOCK_PUSH_PER_KIND_DAILY,
  clockPushBudgetDay,
  getRedisConfig,
  isBudgetedClockPush,
} from '@hbcfield/shared';

/**
 * Check-and-count in one step, so two replicas sending at once cannot both take
 * the last place: the nudge goes only while the day's total and this kind's
 * count are under their caps, and both are counted in the same call.
 */
const TAKE_PLACE = `
local total = tonumber(redis.call('GET', KEYS[1]) or '0')
local kind = tonumber(redis.call('GET', KEYS[2]) or '0')
if total >= tonumber(ARGV[1]) or kind >= tonumber(ARGV[2]) then return 0 end
redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], 172800)
redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], 172800)
return 1`;

/**
 * The daily budget of clock nudges per person (packages/shared/src/notifications/clock-push-budget.ts).
 * The one guard in the sending path: PushService asks it before a budgeted push.
 */
@Injectable()
export class ClockPushBudgetService implements OnModuleDestroy {
  private readonly logger = new Logger(ClockPushBudgetService.name);
  private readonly redis = new Redis({ ...getRedisConfig(), lazyConnect: true });

  onModuleDestroy() {
    this.redis.disconnect();
  }

  /**
   * Of these recipients, who may still be sent this push today. Pushes outside the
   * budget pass untouched. ⚠️ Fails OPEN: a reminder sent once too often is a smaller
   * harm than a shift end nobody was told about because Redis was briefly away.
   */
  async allowed(userIds: string[], type: unknown, now: Date = new Date()): Promise<string[]> {
    if (!isBudgetedClockPush(type) || userIds.length === 0) return userIds;
    const day = clockPushBudgetDay(now);
    const verdicts = await Promise.all(
      userIds.map(async (id) => {
        try {
          const took = await this.redis.eval(
            TAKE_PLACE,
            2,
            `clockpush:${day}:${id}`,
            `clockpush:${day}:${id}:${type}`,
            CLOCK_PUSH_DAILY_BUDGET,
            CLOCK_PUSH_PER_KIND_DAILY,
          );
          return took === 1;
        } catch (err) {
          this.logger.warn(`clock push budget unavailable, sending anyway: ${err}`);
          return true;
        }
      }),
    );
    const kept = userIds.filter((_, i) => verdicts[i]);
    if (kept.length < userIds.length) {
      this.logger.log(`${type}: ${userIds.length - kept.length} recipient(s) past today's clock push budget`);
    }
    return kept;
  }
}
