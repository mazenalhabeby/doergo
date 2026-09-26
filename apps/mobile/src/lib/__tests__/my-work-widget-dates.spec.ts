/*
  The member's zone. Node re-reads TZ on the next Date operation, so this must
  run before anything below builds a date — the top of the file.
*/
process.env.TZ = 'Europe/Vienna';

import { daysLate } from '@hbcfield/shared/client';
import {
  weekOf, tasksOn, hasHour, nextJobAfter, nextDayStart, msUntilNextDay, sameDay, startOfDay, todaysOwn,
} from '../../components/home/my-work';
import type { Task } from '../api/types';

const task = (over: Record<string, unknown>): Task => ({
  id: 't', title: 'Job', status: 'ASSIGNED', priority: 'MEDIUM', organizationId: 'o', createdById: 'x',
  createdAt: '', updatedAt: '', assignedToId: 'me', assignees: [], ...over,
} as unknown as Task);
const open = () => true;

describe('my-work widget — days in Europe/Vienna', () => {
  it('runs in the member zone (guard for the rest of the file)', () => {
    expect(new Date('2026-07-01T00:00:00Z').getTimezoneOffset()).toBe(-120);
    expect(new Date('2026-12-01T00:00:00Z').getTimezoneOffset()).toBe(-60);
  });

  it('the week starts on Monday and holds today — on a Sunday too', () => {
    const sunday = new Date(2026, 8, 27, 23, 30);
    const w = weekOf(sunday);
    expect(w[0]!.getDay()).toBe(1);
    expect(w[0]!.getDate()).toBe(21);
    expect(w.some((d) => sameDay(d, sunday))).toBe(true);
    expect(w.every((d) => d.getHours() === 0 && d.getMinutes() === 0)).toBe(true);
  });

  it('a week spanning the October DST change is still seven local midnights', () => {
    const w = weekOf(new Date(2026, 9, 25, 12)); // Sunday 25 Oct 2026, the 25-hour day
    expect(w.map((d) => d.getDate())).toEqual([19, 20, 21, 22, 23, 24, 25]);
    expect(w.every((d) => d.getHours() === 0)).toBe(true);
  });

  it('25 October (25 h): a 23:30 job is ON that day, not on no day', () => {
    const late = task({ id: 'late', dueDate: new Date(2026, 9, 25, 23, 30).toISOString() });
    expect(tasksOn([late], new Date(2026, 9, 25)).map((x) => x.id)).toEqual(['late']);
    expect(tasksOn([late], new Date(2026, 9, 26))).toEqual([]);
  });

  it('29 March (23 h): a 00:30 job on the 30th is on ONE day, not two', () => {
    const early = task({ id: 'early', dueDate: new Date(2026, 2, 30, 0, 30).toISOString() });
    expect(tasksOn([early], new Date(2026, 2, 29))).toEqual([]);
    expect(tasksOn([early], new Date(2026, 2, 30)).map((x) => x.id)).toEqual(['early']);
  });

  it('every instant of a DST week lands on exactly one day of the strip', () => {
    const w = weekOf(new Date(2026, 9, 25));
    for (let h = 0; h < 7 * 24 + 1; h += 0.5) {
      const at = new Date(w[0]!.getTime() + h * 3_600_000);
      if (at >= nextDayStart(w[6]!)) break;
      const hits = w.filter((d) => tasksOn([task({ dueDate: at.toISOString() })], d).length === 1).length;
      expect(hits).toBe(1);
    }
  });

  it('"next job" after 25 October does not pick a job still ON the 25th', () => {
    const same = task({ id: 'same', dueDate: new Date(2026, 9, 25, 23, 30).toISOString() });
    const next = task({ id: 'next', dueDate: new Date(2026, 9, 27, 9).toISOString() });
    expect(nextJobAfter([same, next], new Date(2026, 9, 25), open)?.id).toBe('next');
  });

  it('nextDayStart and msUntilNextDay honour 23 and 25 hour days', () => {
    expect(nextDayStart(new Date(2026, 9, 25, 5)).getTime() - startOfDay(new Date(2026, 9, 25)).getTime()).toBe(25 * 3_600_000);
    expect(nextDayStart(new Date(2026, 2, 29, 5)).getTime() - startOfDay(new Date(2026, 2, 29)).getTime()).toBe(23 * 3_600_000);
    expect(msUntilNextDay(new Date(2026, 8, 26, 23, 59, 0))).toBe(60_000);
    expect(msUntilNextDay(new Date(2026, 9, 25, 23, 0))).toBe(3_600_000);
  });

  it('midnight in the member zone carries no hour — also on a DST Sunday', () => {
    expect(hasHour(new Date(2026, 8, 9).toISOString())).toBe(false);          // 2026-09-08T22:00Z
    expect(hasHour('2026-09-08T22:00:00.000Z')).toBe(false);
    expect(hasHour(new Date(2026, 9, 25).toISOString())).toBe(false);
    expect(hasHour(new Date(2026, 9, 25, 13).toISOString())).toBe(true);
    expect(hasHour('2026-09-09T00:00:00.000Z')).toBe(true);                    // 02:00 Vienna
    expect(hasHour(null)).toBe(false);
  });

  /*
    The emulator read "17 Tage überfällig" on 26 Sep for REWE (2026-09-08T22:00Z).
    That instant is 9 September in Vienna — the job was entered as a day, and
    the day is the 9th — so 17 is right, and 18 would be the UTC reading.
  */
  it('the emulator case: due 2026-09-08T22:00Z is 17 days late on 26 September', () => {
    const now = new Date(2026, 8, 26, 23, 20);
    expect(daysLate('2026-09-08T22:00:00.000Z', now)).toBe(17);
    expect(daysLate(new Date(2026, 8, 25, 9).toISOString(), now)).toBe(1);
    expect(daysLate(new Date(2026, 8, 26, 9).toISOString(), now)).toBe(0);
    expect(daysLate(null, now)).toBeNull();
  });

  it('late across the October change counts calendar days, not 24h blocks', () => {
    expect(daysLate(new Date(2026, 9, 24, 23).toISOString(), new Date(2026, 9, 26, 0, 30))).toBe(2);
  });

  it('today carries what is overdue and under way, and drops undated work that is not', () => {
    const now = new Date(2026, 8, 26, 10);
    const list = [
      task({ id: 'enroute', status: 'EN_ROUTE', dueDate: '2026-09-08T22:00:00.000Z' }),
      task({ id: 'overdue', status: 'ASSIGNED', dueDate: new Date(2026, 8, 20, 9).toISOString() }),
      task({ id: 'today', status: 'ASSIGNED', dueDate: new Date(2026, 8, 26, 14).toISOString() }),
      task({ id: 'undated', status: 'ASSIGNED', dueDate: null }),
      task({ id: 'undatedDoing', status: 'IN_PROGRESS', dueDate: null }),
      task({ id: 'future', status: 'ASSIGNED', dueDate: new Date(2026, 8, 28, 9).toISOString() }),
    ];
    const ids = todaysOwn(list, startOfDay(now), open, now).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['enroute', 'overdue', 'today', 'undatedDoing']));
    expect(ids).not.toContain('undated');
    expect(ids).not.toContain('future');
    // Under way outranks overdue, which outranks today's.
    expect(ids.indexOf('enroute')).toBeLessThan(ids.indexOf('overdue'));
    expect(ids.indexOf('overdue')).toBeLessThan(ids.indexOf('today'));
  });

  it('a list of today is never shown twice', () => {
    const now = new Date(2026, 8, 26, 10);
    const list = [
      task({ id: 'a', status: 'EN_ROUTE', dueDate: new Date(2026, 8, 26, 9).toISOString() }),
      task({ id: 'b', status: 'ASSIGNED', dueDate: new Date(2026, 8, 26, 12).toISOString() }),
    ];
    const ids = todaysOwn(list, startOfDay(now), open, now).map((x) => x.id);
    expect(ids).toEqual(['a', 'b']);
  });
});
