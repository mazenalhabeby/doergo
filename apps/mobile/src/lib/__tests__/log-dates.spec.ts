import { LOG_MEMBER_BACKDATE_DAYS, logDateProblem } from '@hbcfield/shared/client';
import { dateFromDayKey, dayKeyOf, logEntryDayBounds, occurredAtForDay } from '../log-dates';

/**
 * The days the logbook's calendar offers — pinned against the rule the server
 * refuses by, so a day the phone offers is a day the server takes.
 */

// A Monday afternoon, local time.
const now = new Date(2026, 8, 14, 15, 30, 0);

describe('day keys', () => {
  it('is the LOCAL day, not the UTC one', () => {
    // 00:30 local: toISOString() would answer the previous day east of Greenwich.
    expect(dayKeyOf(new Date(2026, 8, 15, 0, 30))).toBe('2026-09-15');
  });

  it('reads a real day and refuses everything else', () => {
    expect(dateFromDayKey('2026-09-14')?.getTime()).toBe(new Date(2026, 8, 14).getTime());
    for (const bad of ['', '2026-02-30', '14.09.2026', '2026-9-14', 'yesterday', null, undefined]) {
      expect(dateFromDayKey(bad as string)).toBeNull();
    }
  });

  it('round-trips', () => {
    expect(dayKeyOf(dateFromDayKey('2024-02-29')!)).toBe('2024-02-29');
  });
});

describe('logEntryDayBounds', () => {
  it('ends today — never offers tomorrow', () => {
    const { maxDate } = logEntryDayBounds(now);
    expect(dayKeyOf(maxDate)).toBe('2026-09-14');
  });

  it("reaches a member back no further than the server's window", () => {
    const { minDate } = logEntryDayBounds(now);
    expect(minDate).toBeDefined();
    const span = Math.round((new Date(2026, 8, 14).getTime() - minDate!.getTime()) / 86_400_000);
    expect(span).toBe(LOG_MEMBER_BACKDATE_DAYS - 1);
  });

  it('every offered day is accepted by the server rule, at any time of day', () => {
    for (const hour of [0, 9, 12, 23]) {
      const at = new Date(2026, 8, 14, hour, 59);
      const { minDate, maxDate } = logEntryDayBounds(at);
      for (const edge of [minDate!, maxDate]) {
        const filed = occurredAtForDay(dayKeyOf(edge), at)!;
        expect(logDateProblem(filed, { now: at })).toBeNull();
      }
    }
  });

  it('by the afternoon, the day before the first offered one is refused — the bound is not just cautious', () => {
    const { minDate } = logEntryDayBounds(now);
    const before = new Date(minDate!.getFullYear(), minDate!.getMonth(), minDate!.getDate() - 1);
    expect(logDateProblem(occurredAtForDay(dayKeyOf(before), now)!, { now })).toBe('too-old');
  });

  it('somebody who manages assets types in history: no lower bound', () => {
    expect(logEntryDayBounds(now, { canManageAssets: true }).minDate).toBeUndefined();
    const lastYear = occurredAtForDay('2025-03-01', now)!;
    expect(logDateProblem(lastYear, { now, canManageAssets: true })).toBeNull();
    expect(logDateProblem(lastYear, { now })).toBe('too-old');
  });
});

describe('occurredAtForDay', () => {
  it('today is now, so two entries this morning keep their order', () => {
    expect(occurredAtForDay('2026-09-14', now)!.getTime()).toBe(now.getTime());
  });

  it('a past day is its local midday', () => {
    const d = occurredAtForDay('2026-09-10', now)!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 10, 12]);
  });

  it('nothing for a day that does not exist', () => {
    expect(occurredAtForDay('2026-02-30', now)).toBeNull();
  });
});

describe('logDateProblem', () => {
  it('refuses the future past a day of grace', () => {
    expect(logDateProblem(new Date(now.getTime() + 60 * 60_000), { now })).toBeNull();
    expect(logDateProblem(new Date(now.getTime() + 2 * 86_400_000), { now })).toBe('future');
  });
});
