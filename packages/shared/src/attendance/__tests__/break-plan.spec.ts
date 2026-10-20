import {
  resolveBreakPlan,
  outstandingBreaks,
  nextBreakRemindAt,
  snooze,
  markTaken,
  markMissed,
  missedRequired,
  isExpired,
  parseBreakPlan,
  MAX_SNOOZES_DEFAULT,
  MIN_SNOOZE_MINUTES,
  type BreakRuleLike,
} from '@hbcfield/shared';

/**
 * Rules become one shift's plan, once, at clock-in.
 *
 * This is the half that decides WHEN somebody is asked to stop working, so the
 * cases that matter are the awkward ones: a night shift whose "midday" is on the
 * next calendar page, a rest that does not apply to a short day, and a member who
 * answers "later" until the system should stop asking.
 */
const iso = (s: string) => new Date(s);
const VIENNA = 'Europe/Vienna';

const lunch: BreakRuleLike = {
  id: 'r-lunch', name: 'Lunch', trigger: 'LOCAL_WINDOW',
  earliestLocal: '11:30', latestLocal: '13:30',
  durationMinutes: 30, isPaid: false, isRequired: true, remind: true, snoozeMin: 15, maxSnoozes: null,
};
const afternoon: BreakRuleLike = {
  id: 'r-pm', name: 'Afternoon rest', trigger: 'AFTER_WORKED', afterMinutes: 480,
  durationMinutes: 15, isPaid: true, isRequired: false, remind: true, snoozeMin: 15, maxSnoozes: null,
};

// A 06:00–18:00 Vienna day in September: local 06:00 = 04:00Z.
const DAY = {
  clockInAt: iso('2026-09-06T03:55:00Z'),
  expectedStartAt: iso('2026-09-06T04:00:00Z'),
  expectedEndAt: iso('2026-09-06T16:00:00Z'),
  timezone: VIENNA,
};

describe('resolving a plan', () => {
  it('puts a local-window rest at that local time, as an absolute instant', () => {
    const [item] = resolveBreakPlan([lunch], DAY);
    expect(item.dueAt).toBe('2026-09-06T09:30:00.000Z'); // 11:30 Vienna
    expect(item.expiresAt).toBe('2026-09-06T11:30:00.000Z'); // 13:30 Vienna
    expect(item.state).toBe('PENDING');
  });

  it('counts an after-worked rest from the SHIFT start, not from an early arrival', () => {
    // Otherwise arriving twenty minutes early moves that person's rest twenty
    // minutes earlier than everyone else's, for no reason they could explain.
    const [item] = resolveBreakPlan([afternoon], DAY);
    expect(item.dueAt).toBe('2026-09-06T12:00:00.000Z'); // 04:00Z + 8h
  });

  it('falls back to the clock-in when there is no shift at all', () => {
    const [item] = resolveBreakPlan([afternoon], { clockInAt: iso('2026-09-06T07:00:00Z'), timezone: VIENNA });
    expect(item.dueAt).toBe('2026-09-06T15:00:00.000Z');
  });

  it('drops a rest that would fall after the shift has ended', () => {
    // "After 8 hours" on a six-hour day is not a missed rest; it does not apply.
    const short = { ...DAY, expectedEndAt: iso('2026-09-06T10:00:00Z') };
    expect(resolveBreakPlan([afternoon], short)).toHaveLength(0);
  });

  it('puts a night shift’s window on the day the shift is RUNNING', () => {
    // A 22:00 Vienna start with a 01:00 rest: without this the rest resolves
    // twenty-one hours into the past and the sweep fires it instantly.
    const night = {
      clockInAt: iso('2026-09-06T20:00:00Z'),
      expectedStartAt: iso('2026-09-06T20:00:00Z'),
      expectedEndAt: iso('2026-09-07T04:00:00Z'),
      timezone: VIENNA,
    };
    const rule = { ...lunch, earliestLocal: '01:00', latestLocal: '03:00' };
    const [item] = resolveBreakPlan([rule], night);
    expect(new Date(item.dueAt).getTime()).toBeGreaterThan(night.clockInAt.getTime());
    expect(item.dueAt).toBe('2026-09-06T23:00:00.000Z'); // 01:00 Vienna, next day
    expect(new Date(item.expiresAt!).getTime()).toBeGreaterThan(new Date(item.dueAt).getTime());
  });

  it('returns them in the order they fall due', () => {
    const plan = resolveBreakPlan([afternoon, lunch], DAY);
    expect(plan.map((i) => i.ruleId)).toEqual(['r-lunch', 'r-pm']);
  });
});

describe('the indexed deadline', () => {
  it('is the next outstanding rest', () => {
    const plan = resolveBreakPlan([lunch, afternoon], DAY);
    expect(nextBreakRemindAt(plan, iso('2026-09-06T05:00:00Z'))).toEqual(iso('2026-09-06T09:30:00.000Z'));
  });

  it('is null once nothing is outstanding — the sweep must stop looking', () => {
    const plan = markTaken(resolveBreakPlan([lunch], DAY), 'r-lunch', 'b1');
    expect(nextBreakRemindAt(plan)).toBeNull();
  });

  it('never points into the past, so an overdue rest is due NOW rather than skipped', () => {
    const plan = resolveBreakPlan([lunch], DAY);
    const now = iso('2026-09-06T10:00:00Z'); // half an hour past due
    expect(nextBreakRemindAt(plan, now)).toEqual(now);
  });
});

describe('"later"', () => {
  it('pushes it out by the rule’s interval', () => {
    const plan = resolveBreakPlan([lunch], DAY);
    const now = iso('2026-09-06T09:30:00Z');
    const after = snooze(plan, 'r-lunch', { snoozeMin: 15, now });
    expect(after[0].state).toBe('SNOOZED');
    expect(after[0].dueAt).toBe('2026-09-06T09:45:00.000Z');
    expect(after[0].snoozeCount).toBe(1);
  });

  it('stops asking after the cap and records it as missed', () => {
    // The correction to the first design: "ask forever" collects forty
    // notifications in a locker and teaches people to mute the channel.
    let plan = resolveBreakPlan([lunch], DAY);
    for (let i = 0; i <= MAX_SNOOZES_DEFAULT; i++) {
      plan = snooze(plan, 'r-lunch', { snoozeMin: 15, now: iso('2026-09-06T09:30:00Z') });
    }
    expect(plan[0].state).toBe('MISSED');
    expect(nextBreakRemindAt(plan)).toBeNull();
  });

  it('honours a rule’s own cap when it sets one', () => {
    let plan = resolveBreakPlan([lunch], DAY);
    plan = snooze(plan, 'r-lunch', { snoozeMin: 15, maxSnoozes: 1 });
    expect(plan[0].state).toBe('SNOOZED');
    plan = snooze(plan, 'r-lunch', { snoozeMin: 15, maxSnoozes: 1 });
    expect(plan[0].state).toBe('MISSED');
  });

  it('refuses an interval shorter than the floor, whatever a rule says', () => {
    const now = iso('2026-09-06T09:30:00Z');
    const plan = snooze(resolveBreakPlan([lunch], DAY), 'r-lunch', { snoozeMin: 0, now });
    const gapMin = (new Date(plan[0].dueAt).getTime() - now.getTime()) / 60000;
    expect(gapMin).toBe(MIN_SNOOZE_MINUTES);
  });

  it('does nothing to a rest already taken', () => {
    const taken = markTaken(resolveBreakPlan([lunch], DAY), 'r-lunch', 'b1');
    expect(snooze(taken, 'r-lunch', { snoozeMin: 15 })[0].state).toBe('TAKEN');
  });
});

describe('state', () => {
  it('links a taken rest to the break that proves it', () => {
    const plan = markTaken(resolveBreakPlan([lunch], DAY), 'r-lunch', 'brk_7', iso('2026-09-06T10:00:00Z'));
    expect(plan[0]).toMatchObject({ state: 'TAKEN', breakId: 'brk_7', takenAt: '2026-09-06T10:00:00.000Z' });
    expect(outstandingBreaks(plan)).toHaveLength(0);
  });

  it('knows when the window has closed', () => {
    const [item] = resolveBreakPlan([lunch], DAY);
    expect(isExpired(item, iso('2026-09-06T11:00:00Z'))).toBe(false);
    expect(isExpired(item, iso('2026-09-06T12:00:00Z'))).toBe(true);
  });

  it('reports a required rest that never happened — to FLAG, never to deduct', () => {
    const plan = markMissed(resolveBreakPlan([lunch, afternoon], DAY), 'r-lunch');
    const missed = missedRequired(plan);
    expect(missed.map((i) => i.ruleId)).toEqual(['r-lunch']); // the optional one is not chased
  });

  it('reads a damaged or empty column as no plan rather than throwing mid-shift', () => {
    expect(parseBreakPlan(null)).toEqual([]);
    expect(parseBreakPlan('nonsense')).toEqual([]);
    expect(parseBreakPlan([{ nope: true }, { ruleId: 'r', dueAt: '2026-01-01T00:00:00Z' }])).toHaveLength(1);
  });
});
