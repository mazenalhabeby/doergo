import {
  resolveBreakPlan,
  plannedRestForTap,
  tapSatisfiesPlannedRest,
  nextBreakRemindAt,
  breakNeedingAttention,
  isRemindable,
  requiredRestsMissed,
  flagsWithMissedRest,
  MISSED_REST_FLAG,
  markTaken,
  snooze,
  breakTotals,
  endRunningBreaks,
  SCHEDULE_TIME_FLAGS,
  flagsAgainstDailyLimit,
  type BreakRuleLike,
  type BreakPlanItem,
} from '@hbcfield/shared';
import { approvalFor } from '../attendance-occurrence';

/**
 * The pure rules behind three rest bugs: a coffee filed as lunch, a rule with
 * reminders off being asked about anyway, and a missed required rest that
 * flagged nothing. Each rule is answered once, in shared, so the sweep, the
 * "Later" button, the office close and the phone cannot disagree.
 */
const at = (hm: string) => new Date(`2026-09-07T${hm}:00Z`);

// A 07:00–16:00 UTC shift (zone UTC keeps the arithmetic readable).
const ctx = { clockInAt: at('07:00'), expectedStartAt: at('07:00'), expectedEndAt: at('16:00'), timezone: 'UTC' };
const lunch: BreakRuleLike = {
  id: 'lunch', name: 'Lunch', trigger: 'LOCAL_WINDOW', earliestLocal: '12:00', latestLocal: '13:30',
  durationMinutes: 30, isPaid: false, isRequired: true, remind: true, snoozeMin: 10, maxSnoozes: 2,
};
const silent: BreakRuleLike = {
  id: 'quiet', name: 'Quiet rest', trigger: 'LOCAL_WINDOW', earliestLocal: '10:00', latestLocal: '11:00',
  durationMinutes: 15, isPaid: true, isRequired: true, remind: false, snoozeMin: 10, maxSnoozes: null,
};

describe('which planned rest a tap is', () => {
  const plan = resolveBreakPlan([lunch], ctx);

  it('a 09:00 coffee is an unplanned break, not lunch', () => {
    expect(plannedRestForTap(plan, { at: at('09:00') })).toBeNull();
    expect(tapSatisfiesPlannedRest(plan[0], at('09:00'))).toBe(false);
  });

  it('a tap inside the window — or just before it, within the lead — is lunch', () => {
    expect(plannedRestForTap(plan, { at: at('12:20') })?.ruleId).toBe('lunch');
    // Ten minutes is the rule's own "Later" interval: 11:50 is going early to lunch.
    expect(plannedRestForTap(plan, { at: at('11:50') })?.ruleId).toBe('lunch');
    expect(plannedRestForTap(plan, { at: at('11:45') })).toBeNull();
  });

  it('after the window closes a tap is no longer that rest', () => {
    expect(plannedRestForTap(plan, { at: at('13:31') })).toBeNull();
  });

  it('a snoozed rest has already fallen due, so any tap before its window closes is it', () => {
    const snoozed = snooze(plan, 'lunch', { snoozeMin: 10, maxSnoozes: 2, now: at('12:00') });
    expect(snoozed[0].state).toBe('SNOOZED');
    expect(plannedRestForTap(snoozed, { at: at('12:01') })?.ruleId).toBe('lunch');
  });

  it('naming the rule wins whatever the time — but never a rest already taken', () => {
    expect(plannedRestForTap(plan, { ruleId: 'lunch', at: at('09:00') })?.ruleId).toBe('lunch');
    const taken = markTaken(plan, 'lunch', 'b1', at('12:05'));
    expect(plannedRestForTap(taken, { ruleId: 'lunch', at: at('12:40') })).toBeNull();
    expect(plannedRestForTap(taken, { at: at('12:40') })).toBeNull();
  });
});

describe('a rule with reminders off is never asked about', () => {
  const plan = resolveBreakPlan([silent, lunch], ctx);

  it('freezes the rule\'s choice onto the plan; older plans without it stay remindable', () => {
    expect(plan.find((i) => i.ruleId === 'quiet')?.remind).toBe(false);
    const legacy = { ...plan[1] } as BreakPlanItem;
    delete (legacy as Partial<BreakPlanItem>).remind;
    expect(isRemindable(legacy)).toBe(true);
  });

  it('the indexed deadline skips its due time and wakes only for its window closing', () => {
    // Silent rest due 10:00 (not asked), lunch due 12:00, silent window closes 11:00.
    expect(nextBreakRemindAt(plan, at('08:00'))).toEqual(at('11:00'));
    const quietMissedOrTaken = markTaken(plan, 'quiet', 'b0', at('10:05'));
    expect(nextBreakRemindAt(quietMissedOrTaken, at('10:30'))).toEqual(at('12:00'));
  });

  it('at its due time nothing needs attention; once its window closes it does — to be recorded missed', () => {
    expect(breakNeedingAttention(plan, at('10:30'))).toBeNull();
    expect(breakNeedingAttention(plan, at('11:00'))?.ruleId).toBe('quiet');
  });
});

describe('a missed required rest flags — and deducts nothing', () => {
  const plan = resolveBreakPlan([lunch], ctx);

  it('mid-shift only a rest recorded MISSED counts', () => {
    expect(requiredRestsMissed(plan)).toHaveLength(0);
    let p = snooze(plan, 'lunch', { snoozeMin: 10, maxSnoozes: 2, now: at('12:00') });
    p = snooze(p, 'lunch', { snoozeMin: 10, maxSnoozes: 2, now: at('12:10') });
    p = snooze(p, 'lunch', { snoozeMin: 10, maxSnoozes: 2, now: at('12:20') });
    expect(p[0].state).toBe('MISSED');
    expect(flagsWithMissedRest(['LATE_ARRIVAL'], p)).toEqual(['LATE_ARRIVAL', MISSED_REST_FLAG]);
  });

  it('at the close an outstanding required rest that had fallen due is missed; one not yet due is not', () => {
    expect(flagsWithMissedRest([], plan, at('14:00'))).toEqual([MISSED_REST_FLAG]);
    // Left at 11:00, before lunch was due: they did not work long enough for it.
    expect(flagsWithMissedRest([], plan, at('11:00'))).toEqual([]);
  });

  it('adds once, never removes, and leaves an optional rest alone', () => {
    expect(flagsWithMissedRest([MISSED_REST_FLAG], plan, at('14:00'))).toEqual([MISSED_REST_FLAG]);
    const optional = resolveBreakPlan([{ ...lunch, isRequired: false }], ctx);
    expect(flagsWithMissedRest([], optional, at('14:00'))).toEqual([]);
  });

  it('the flag puts the entry in front of a person', () => {
    expect(MISSED_REST_FLAG).toBe('MISSED_BREAK');
    expect(approvalFor([MISSED_REST_FLAG])).toBe('PENDING');
  });
});

describe('rest totals from the rows', () => {
  it('sums completed rests; only the unpaid ones are what counted time subtracts', () => {
    expect(
      breakTotals([
        { startedAt: at('10:00'), endedAt: at('10:15'), durationMinutes: 15, isPaid: true },
        { startedAt: at('12:00'), endedAt: at('12:30'), durationMinutes: 30, isPaid: false },
        { startedAt: at('14:00'), endedAt: null, durationMinutes: null, isPaid: false },
      ]),
    ).toEqual({ breakMinutes: 45, unpaidBreakMinutes: 30 });
  });

  it('ends a running rest at the close, never before it began', () => {
    const { rows, ended } = endRunningBreaks(
      [
        { id: 'a', startedAt: at('10:00'), endedAt: at('10:15'), durationMinutes: 15 },
        { id: 'b', startedAt: at('15:00'), endedAt: null, durationMinutes: null },
        { id: 'c', startedAt: at('16:30'), endedAt: null, durationMinutes: null },
      ],
      at('16:00'),
    );
    expect(ended.map((b) => [b.id, b.durationMinutes])).toEqual([['b', 60], ['c', 0]]);
    expect(breakTotals(rows).breakMinutes).toBe(75);
  });
});

describe('time-dependent flags', () => {
  it('include the daily limit, so a time edit re-reads it', () => {
    expect([...SCHEDULE_TIME_FLAGS].sort()).toEqual(['EARLY_DEPARTURE', 'LATE_ARRIVAL', 'OVERTIME', 'PAST_DAILY_LIMIT']);
  });

  it('read against a daily allowance: never early, and over it is past the limit', () => {
    expect(flagsAgainstDailyLimit(['LATE_ARRIVAL', 'OVERTIME'], true)).toEqual(['LATE_ARRIVAL', 'PAST_DAILY_LIMIT']);
    expect(flagsAgainstDailyLimit(['EARLY_DEPARTURE'], true)).toEqual([]);
    expect(flagsAgainstDailyLimit(['EARLY_DEPARTURE', 'OVERTIME'], false)).toEqual(['EARLY_DEPARTURE', 'OVERTIME']);
  });
});
