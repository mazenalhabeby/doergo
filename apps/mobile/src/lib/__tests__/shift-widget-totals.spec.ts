/**
 * The clocked-out figures — ① vs ⑥, the week, the month — out of one history
 * answer. Local dates on purpose: `readTotals` compares the member's own
 * calendar days, which is what these build.
 */
import type { TimeEntry } from '@hbcfield/shared/client';

// The pure readers only — the network and the keep-store are not under test.
jest.mock('../../lib/api/attendance', () => ({ attendanceApi: {} }));
jest.mock('../../features/home/remember/use-remembered', () => ({ useRemembered: () => ({ data: null, ready: true }) }));

import { readTotals, historyFrom } from '../../features/home/use-schedule-totals';

const at = (mo: number, d: number, h: number, m = 0) => new Date(2026, mo - 1, d, h, m).toISOString();
const shift = (inAt: string, outAt: string | null, minutes: number, over: Record<string, unknown> = {}): TimeEntry =>
  ({ id: `${inAt}`, clockInAt: inAt, clockOutAt: outAt, paidMinutes: minutes, totalMinutes: minutes, approvalStatus: 'PENDING', ...over }) as unknown as TimeEntry;

describe('⑥ — the shift that ENDED today', () => {
  it('a night shift in yesterday, out this morning, is today\'s ⑥', () => {
    const night = shift(at(9, 25, 21, 16), at(9, 26, 5, 16), 600);
    const t = readTotals([night], new Date(2026, 8, 26, 7, 0));
    expect(t.lastToday?.id).toBe(night.id);
  });

  it('a shift that started today but has not ended is not ⑥', () => {
    const t = readTotals([shift(at(9, 26, 8), null, 0)], new Date(2026, 8, 26, 12));
    expect(t.lastToday).toBeNull();
  });

  it('a shift that ended yesterday is not today\'s', () => {
    const t = readTotals([shift(at(9, 25, 8), at(9, 25, 16), 480)], new Date(2026, 8, 26, 9));
    expect(t.lastToday).toBeNull();
  });

  it('of two shifts today, the one that ended LAST', () => {
    const a = shift(at(9, 26, 6), at(9, 26, 10), 240);
    const b = shift(at(9, 26, 12), at(9, 26, 15), 180);
    expect(readTotals([b, a], new Date(2026, 8, 26, 18)).lastToday?.id).toBe(b.id);
  });

  it('counted falls back to totalMinutes for entries closed before the rule existed', () => {
    const old = { ...shift(at(9, 22, 8), at(9, 22, 16), 0), paidMinutes: null, totalMinutes: 470 } as unknown as TimeEntry;
    expect(readTotals([old], new Date(2026, 8, 26, 9)).weekMinutes).toBe(470);
  });
});

describe('the week and the month', () => {
  it('a week that began last month counts its first days', () => {
    // Tue 1 Sep 2026: the week began Mon 31 Aug.
    const monday = shift(at(8, 31, 8), at(8, 31, 16), 480);
    const tuesday = shift(at(9, 1, 8), at(9, 1, 10), 120);
    const t = readTotals([monday, tuesday], new Date(2026, 8, 1, 12));
    expect(t.weekMinutes).toBe(600);
    // …but the MONTH is September's only
    expect(t.monthMinutes).toBe(120);
  });

  it('a running shift is not a total yet', () => {
    const t = readTotals([shift(at(9, 26, 8), null, 999)], new Date(2026, 8, 26, 12));
    expect(t.weekMinutes).toBe(0);
    expect(t.monthMinutes).toBe(0);
  });

  it('lastIn is the most recent clock-in of a closed shift', () => {
    const a = shift(at(9, 18, 8), at(9, 18, 16), 480);
    const b = shift(at(9, 24, 8), at(9, 24, 16), 480);
    expect(readTotals([a, b], new Date(2026, 8, 26, 9)).lastIn?.toISOString()).toBe(b.clockInAt);
  });
});

describe('historyFrom — how far back the one request must reach', () => {
  const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  it('mid-month: the 1st, less a day for a night shift that ended on it', () => {
    expect(ymd(historyFrom(new Date(2026, 8, 26, 9)))).toEqual([2026, 8, 31]);
  });
  it('when the week began last month: the week\'s Monday, less a day', () => {
    // Tue 1 Sep → week began Mon 31 Aug → from Sun 30 Aug
    expect(ymd(historyFrom(new Date(2026, 8, 1, 9)))).toEqual([2026, 8, 30]);
  });
  it('across a year', () => {
    // Fri 1 Jan 2027 → week began Mon 28 Dec 2026 → from 27 Dec
    expect(ymd(historyFrom(new Date(2027, 0, 1, 9)))).toEqual([2026, 12, 27]);
  });
  it('on the DST day it is still a local midnight', () => {
    const d = historyFrom(new Date(2026, 9, 25, 12));
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });
});

describe('the Time tab\'s week bars — the same answer, split by day', () => {
  // Sunday 27 Sep 2026: the week is Mon 21 – Sun 27.
  const now = new Date(2026, 8, 27, 12);

  it('puts each shift on the day it STARTED, Monday first, and adds up to the week total', () => {
    const t = readTotals([
      shift(at(9, 21, 7), at(9, 21, 15), 480),
      shift(at(9, 23, 7), at(9, 23, 15), 450),
      shift(at(9, 23, 16), at(9, 23, 18), 120),
      shift(at(9, 26, 21), at(9, 27, 5), 480), // a night shift belongs to Saturday
    ], now);
    expect(t.weekDays).toEqual([480, 0, 570, 0, 0, 480, 0]);
    expect(t.weekDays.reduce((a, b) => a + b, 0)).toBe(t.weekMinutes);
  });

  it('leaves out last week and a running shift', () => {
    const t = readTotals([shift(at(9, 20, 8), at(9, 20, 16), 480), shift(at(9, 27, 8), null, 0)], now);
    expect(t.weekDays).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
