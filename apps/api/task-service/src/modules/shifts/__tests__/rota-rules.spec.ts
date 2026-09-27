/**
 * The rota's one rule set — what the clock-in and the Schedules page both read —
 * and what changing one day does to it.
 */
import { rotaFor, rotaRunsOn, planRotaDay, RotaDayRefused, type RotaAssignmentLike } from '@hbcfield/shared';
import { weekOf } from '../shifts.service';

const a = (over: Partial<RotaAssignmentLike>): RotaAssignmentLike => ({
  id: 'x', recurrence: 'WEEKLY', daysOfWeek: [], daysOfMonth: [], dates: [], effectiveFrom: '2026-01-01', effectiveTo: null,
  priority: 0, isActive: true, shiftId: 's-morning', shift: { isActive: true }, ...over,
});
// 2026-09-21 is a Monday.
const MON = '2026-09-21', WED = '2026-09-23';

describe('reading the rota', () => {
  it('WEEKLY runs on its weekdays; ONE_OFF on its dates as calendar days', () => {
    expect(rotaRunsOn(a({ daysOfWeek: [1] }), MON)).toBe(true);
    expect(rotaRunsOn(a({ daysOfWeek: [1] }), WED)).toBe(false);
    expect(rotaRunsOn(a({ recurrence: 'ONE_OFF', dates: [new Date('2026-09-23T00:00:00.000Z')] }), WED)).toBe(true);
  });

  it('the highest priority decides; a rule not yet in force or ended does not', () => {
    const weekly = a({ id: 'w', daysOfWeek: [3] });
    const once = a({ id: 'o', recurrence: 'ONE_OFF', dates: [WED], priority: 1, shiftId: 's-night' });
    expect(rotaFor([weekly, once], WED)?.id).toBe('o');
    expect(rotaFor([a({ daysOfWeek: [3], effectiveFrom: '2026-10-01' })], WED)).toBeNull();
    expect(rotaFor([a({ daysOfWeek: [3], effectiveTo: '2026-09-22' })], WED)).toBeNull();
    expect(rotaFor([a({ daysOfWeek: [3], shift: { isActive: false } })], WED)).toBeNull();
  });

  it('the week is Monday to Sunday around any day', () => {
    expect(weekOf('2026-09-27')).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
  });
});

describe('changing one day', () => {
  it('a shift for one day is a one-off above every standing rule', () => {
    const ops = planRotaDay([a({ id: 'w', daysOfWeek: [3], priority: 2 })], { date: WED, shiftId: 's-night', repeat: 'once' });
    expect(ops).toEqual([{ kind: 'create', data: expect.objectContaining({ recurrence: 'ONE_OFF', shiftId: 's-night', dates: [WED], priority: 3 }) }]);
  });

  it('a one-off already on that day is replaced, not stacked', () => {
    const ops = planRotaDay([a({ id: 'o', recurrence: 'ONE_OFF', dates: [WED, '2026-09-24'] })], { date: WED, shiftId: 's-night', repeat: 'once' });
    expect(ops[0]).toEqual({ kind: 'update', id: 'o', data: { dates: ['2026-09-24'] } });
  });

  it('OFF for one day over a standing shift is refused — that is time off', () => {
    expect(() => planRotaDay([a({ daysOfWeek: [3] })], { date: WED, shiftId: null, repeat: 'once' })).toThrow(RotaDayRefused);
  });

  it('OFF for one day that was only a one-off just removes the one-off', () => {
    const ops = planRotaDay([a({ id: 'o', recurrence: 'ONE_OFF', dates: [WED] })], { date: WED, shiftId: null, repeat: 'once' });
    expect(ops).toEqual([{ kind: 'update', id: 'o', data: { isActive: false } }]);
  });

  it('weekly: a rule that already ran is ENDED the day before and continued — history is not rewritten', () => {
    const ops = planRotaDay([a({ id: 'w', daysOfWeek: [1, 3, 5], effectiveFrom: '2026-01-01' })], { date: WED, shiftId: null, repeat: 'weekly' });
    expect(ops).toEqual([
      { kind: 'update', id: 'w', data: { effectiveTo: '2026-09-22' } },
      { kind: 'clone', fromId: 'w', data: { daysOfWeek: [1, 5], effectiveFrom: WED } },
    ]);
  });

  it('weekly: moving a weekday to another shift takes it out of one rule and gives it to the other', () => {
    const morning = a({ id: 'm', daysOfWeek: [3], effectiveFrom: '2026-10-07' }); // not started yet → changed in place
    const night = a({ id: 'n', shiftId: 's-night', daysOfWeek: [1], effectiveFrom: '2026-10-07' });
    const ops = planRotaDay([morning, night], { date: '2026-10-07', shiftId: 's-night', repeat: 'weekly' });
    expect(ops).toEqual([
      { kind: 'update', id: 'm', data: { isActive: false } },
      { kind: 'update', id: 'n', data: { daysOfWeek: [1, 3] } },
    ]);
  });

  it('weekly: a new shift with no rule yet becomes a new weekly rule from that day', () => {
    const ops = planRotaDay([], { date: WED, shiftId: 's-morning', repeat: 'weekly' });
    expect(ops).toEqual([{ kind: 'create', data: expect.objectContaining({ recurrence: 'WEEKLY', daysOfWeek: [3], effectiveFrom: WED }) }]);
  });
});
