/**
 * The shift clock's states, driven with the shapes the dev API actually
 * returned on 2026-09-26 (a night shift rostered 19:16Z → 05:16Z, clocked in
 * 21:26Z, a counted "breather" rule due 19:18Z, 10 minutes long).
 *
 * Every instant is written in UTC so these pass in any timezone the runner is
 * in — which is itself the point of several of them: nothing on this card may
 * be derived from a wall clock.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AttendanceStatus, BreakStatus, TimeEntry } from '@hbcfield/shared/client';
import {
  readShiftState, targetLabel, heroParts, workingDaysLeftIn,
} from '../../components/home/shift-state';

const SRC = path.resolve(__dirname, '../..');
const code = (p: string) =>
  fs.readFileSync(path.join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const Z = (s: string) => new Date(`2026-09-26T${s}:00.000Z`);
const RULE = 'cmtq95s22000le3liunwgrkwy';

function entry(over: Partial<TimeEntry> & Record<string, unknown> = {}): TimeEntry {
  return {
    id: 'e1',
    clockInAt: '2026-09-26T21:26:01.264Z',
    clockOutAt: null,
    location: { id: 'w1', name: 'Main Office' },
    approvalStatus: 'PENDING',
    breakMinutes: 0,
    unpaidBreakMinutes: 0,
    expectedClockInAt: '2026-09-26T19:16:00.000Z',
    expectedClockOutAt: '2026-09-27T05:16:00.000Z',
    breakPlan: [{
      name: 'Breather', dueAt: '2026-09-26T19:18:00.000Z', state: 'PENDING', isPaid: true,
      ruleId: RULE, required: false, expiresAt: null, snoozeMin: 5, maxSnoozes: 3, snoozeCount: 0, durationMinutes: 10,
    }],
    ...over,
  } as unknown as TimeEntry;
}
const on = (e: TimeEntry, over: Partial<AttendanceStatus> = {}): AttendanceStatus =>
  ({ isClockedIn: true, currentEntry: e, assignedLocations: [{ id: 'w1' }], ...over }) as unknown as AttendanceStatus;
const off = (over: Partial<AttendanceStatus> = {}): AttendanceStatus =>
  ({ isClockedIn: false, currentEntry: null, assignedLocations: [{ id: 'w1' }], ...over }) as unknown as AttendanceStatus;
const resting = (b: Record<string, unknown>): BreakStatus =>
  ({ isClockedIn: true, isOnBreak: true, currentBreak: { id: 'b1', type: 'SHORT', ...b }, todayBreaks: [], totalBreakMinutes: 0 }) as unknown as BreakStatus;

// ── the rest that fell due before anybody arrived ──────────────────────────
describe('rest overdue — measured from when it fell due ON THE CLOCK', () => {
  it('a late arrival is not greeted with "your rest was due 128 minutes ago"', () => {
    const st = readShiftState({ status: on(entry()), breaks: null, now: new Date('2026-09-26T21:26:30.000Z') });
    expect(st.kind).toBe('working');
    expect(st.restOverdueBy).toBe(0);
    expect(st.nextRest?.ruleId).toBe(RULE);
  });

  it('it becomes overdue once the member has been on the clock past it', () => {
    const st = readShiftState({ status: on(entry()), breaks: null, now: Z('21:40') });
    expect(st.kind).toBe('restOverdue');
    // 21:26:01 → 21:40 = 13 whole minutes, not 142 from the rostered 19:18
    expect(st.restOverdueBy).toBe(13);
  });

  it('a rest due AFTER the clock-in is still measured from its own dueAt', () => {
    const e = entry({
      breakPlan: [{ name: 'Lunch', dueAt: '2026-09-26T23:00:00.000Z', state: 'PENDING', isPaid: false, ruleId: 'r2', durationMinutes: 30, snoozeMin: 5, maxSnoozes: 3, snoozeCount: 0, required: true, expiresAt: null }],
    });
    expect(readShiftState({ status: on(e), breaks: null, now: Z('22:59') }).kind).toBe('working');
    const late = readShiftState({ status: on(e), breaks: null, now: Z('23:07') });
    expect(late.kind).toBe('restOverdue');
    expect(late.restOverdueBy).toBe(7);
  });

  it('a TAKEN rest is no longer next, and never overdue', () => {
    const e = entry({ breakPlan: [{ ...(entry() as any).breakPlan[0], state: 'TAKEN', breakId: 'b1' }] });
    const st = readShiftState({ status: on(e), breaks: null, now: Z('23:00') });
    expect(st.kind).toBe('working');
    expect(st.nextRest).toBeNull();
  });

  it('a snoozed rest is still outstanding', () => {
    const e = entry({ breakPlan: [{ ...(entry() as any).breakPlan[0], state: 'SNOOZED' }] });
    expect(readShiftState({ status: on(e), breaks: null, now: Z('22:00') }).kind).toBe('restOverdue');
  });
});

// ── ③ a counted rest keeps counting ─────────────────────────────────────────
describe('③ — does the rest count?', () => {
  const e = entry({ breakPlan: [{ ...(entry() as any).breakPlan[0], state: 'TAKEN', breakId: 'b1' }] });

  it('a counted rest (isPaid on the break) keeps the counted figure moving', () => {
    const b = resting({ startedAt: '2026-09-26T22:00:00.000Z', ruleId: RULE, isPaid: true });
    const a = readShiftState({ status: on(e), breaks: b, now: Z('22:03') });
    const later = readShiftState({ status: on(e), breaks: b, now: Z('22:08') });
    expect(a.kind).toBe('resting');
    expect(a.restCounts).toBe(true);
    expect(later.countedMinutes! - a.countedMinutes!).toBe(5);
    expect(a.backAt?.toISOString()).toBe('2026-09-26T22:10:00.000Z');
  });

  it('an uncounted rest freezes at the moment it began', () => {
    const b = resting({ startedAt: '2026-09-26T22:00:00.000Z', ruleId: null, isPaid: false, type: 'LUNCH' });
    const a = readShiftState({ status: on(e), breaks: b, now: Z('22:03') });
    const later = readShiftState({ status: on(e), breaks: b, now: Z('22:40') });
    expect(a.restCounts).toBe(false);
    expect(a.countedMinutes).toBe(later.countedMinutes);
    expect(a.countedMinutes).toBe(33); // 21:26:01 → 22:00
    expect(a.backAt).toBeNull(); // taken outside any plan — no promised length
  });

  it('a rest with no isPaid of its own takes its rule\'s answer', () => {
    const b = resting({ startedAt: '2026-09-26T22:00:00.000Z', ruleId: RULE });
    expect(readShiftState({ status: on(e), breaks: b, now: Z('22:03') }).restCounts).toBe(true);
  });

  it('unknown (started offline, no rule) is read as NOT counting — the claim that can only under-state', () => {
    const b = resting({ startedAt: '2026-09-26T22:00:00.000Z' });
    expect(readShiftState({ status: on(e), breaks: b, now: Z('22:03') }).restCounts).toBe(false);
  });

  it('outside ③ restCounts is always false', () => {
    expect(readShiftState({ status: on(e), breaks: null, now: Z('22:03') }).restCounts).toBe(false);
    expect(readShiftState({ status: off(), breaks: null, now: Z('22:03') }).restCounts).toBe(false);
  });

  it('the card captions a counted rest with `counted`, not `not counting now`', () => {
    const card = code('components/home/shift-clock-card.tsx');
    expect(card).toMatch(/resting && !st\.restCounts\s*\?\s*t\('shiftClock\.countedFrozen'/);
  });
});

// ── ② across midnight, overtime, DST ───────────────────────────────────────
describe('② — the figures are instants, never wall clocks', () => {
  it('a night shift across midnight keeps counting through it', () => {
    const st = readShiftState({ status: on(entry()), breaks: null, declaredSchedule: 'FIXED', now: new Date('2026-09-27T01:26:01.264Z') });
    expect(st.minutes).toBe(240);
    // counted from the LATER of arriving and the roster start
    expect(st.countedMinutes).toBe(240);
    expect(st.progress).toEqual({ done: 240, target: 600, past: false });
  });

  it('past the rostered end the bar goes past its target (overtime is owed, not wrong)', () => {
    const e = entry({ clockInAt: '2026-09-26T19:16:00.000Z', breakPlan: [] });
    const st = readShiftState({ status: on(e), breaks: null, declaredSchedule: 'FIXED', now: new Date('2026-09-27T06:00:00.000Z') });
    expect(st.progress).toEqual({ done: 644, target: 600, past: true });
  });

  it('BUG FIXED: a LATE arrival working past the rostered end is past it — overtime, though the total is short', () => {
    // In 2h10 late, out 44 min past the rostered end: 513 of 600, and PAST the end.
    const st = readShiftState({ status: on(entry()), breaks: null, declaredSchedule: 'FIXED', now: new Date('2026-09-27T06:00:00.000Z') });
    expect(st.progress).toEqual({ done: 513, target: 600, past: true });
  });

  it('an early arrival is counted from the roster start, not the clock-in', () => {
    const e = entry({ clockInAt: '2026-09-26T19:00:00.000Z', breakPlan: [] });
    const st = readShiftState({ status: on(e), breaks: null, declaredSchedule: 'FIXED', now: Z('20:16') });
    expect(st.minutes).toBe(76);
    expect(st.countedMinutes).toBe(60);
  });

  it('unpaid rest already taken comes off the counted figure', () => {
    const e = entry({ unpaidBreakMinutes: 30, breakPlan: [] });
    const st = readShiftState({ status: on(e), breaks: null, now: new Date('2026-09-26T23:26:01.264Z') });
    expect(st.minutes).toBe(120);
    expect(st.countedMinutes).toBe(90);
  });

  it('DST: the night the clocks go back is 10 hours of instants, not 9 or 11', () => {
    // Europe: 25 Oct 2026, 03:00 CEST → 02:00 CET.
    const e = entry({
      clockInAt: '2026-10-24T20:00:00.000Z', expectedClockInAt: '2026-10-24T20:00:00.000Z',
      expectedClockOutAt: '2026-10-25T06:00:00.000Z', breakPlan: [],
    });
    const st = readShiftState({ status: on(e), breaks: null, declaredSchedule: 'FIXED', now: new Date('2026-10-25T06:00:00.000Z') });
    expect(st.minutes).toBe(600);
    expect(st.progress).toEqual({ done: 600, target: 600, past: false });
  });

  it('DST: the spring-forward night too', () => {
    const e = entry({ clockInAt: '2026-03-28T21:00:00.000Z', expectedClockInAt: null, expectedClockOutAt: null, breakPlan: [] });
    const st = readShiftState({ status: on(e), breaks: null, now: new Date('2026-03-29T05:00:00.000Z') });
    expect(st.minutes).toBe(480);
  });

  it('a clock-in the phone has not caught up with (clock skew) never reads negative', () => {
    const st = readShiftState({ status: on(entry({ breakPlan: [] })), breaks: null, now: Z('21:20') });
    expect(st.minutes).toBe(0);
    expect(st.countedMinutes).toBe(0);
  });
});

// ── away from a site ──────────────────────────────────────────────────────
describe('away from a site is a MODE, not a place', () => {
  it('an away clock-in still names its workspace', () => {
    const e = entry({ isRemote: true, awayReason: 'Visiting a client', breakPlan: [] });
    const st = readShiftState({ status: on(e), breaks: null, now: Z('22:00') });
    expect(st.kind).toBe('working');
    expect(st.workspace).toBe('Main Office');
  });

  it('an away clock-in with no location is still ② — no workspace, no crash', () => {
    const e = entry({ isRemote: true, location: null as never, breakPlan: [] });
    const st = readShiftState({ status: on(e), breaks: null, now: Z('22:00') });
    expect(st.kind).toBe('working');
    expect(st.workspace).toBeNull();
  });
});

// ── ⑥ approval outcome ─────────────────────────────────────────────────────
describe('⑥ — three approval outcomes, not two', () => {
  const done = (approvalStatus: string) =>
    readShiftState({
      status: off(), breaks: null, now: Z('23:00'),
      lastToday: entry({ clockOutAt: '2026-09-26T22:30:00.000Z', paidMinutes: 60, approvalStatus } as never),
    }).finished!;
  it('PENDING waits', () => expect(done('PENDING')).toMatchObject({ awaitingApproval: true, approved: false }));
  it('APPROVED is approved', () => expect(done('APPROVED')).toMatchObject({ awaitingApproval: false, approved: true }));
  it('AUTO is approved', () => expect(done('AUTO')).toMatchObject({ awaitingApproval: false, approved: true }));
  it('REJECTED is NEITHER — never "counted and approved"', () =>
    expect(done('REJECTED')).toMatchObject({ awaitingApproval: false, approved: false }));
  it('the card only says approved when it is', () => {
    const card = code('components/home/shift-clock-card.tsx');
    expect(card).toMatch(/st\.finished\.approved\s*\?\s*t\('shiftClock\.countedApproved'/);
  });
});

// ── ⑦ ──────────────────────────────────────────────────────────────────────
describe('⑦ — a shift closed at a temporary time wins over everything', () => {
  it('beats ⑥ and ①', () => {
    const st = readShiftState({
      status: off({ unconfirmedClockOut: { id: 'u', clockInAt: Z('08:00'), clockOutAt: Z('16:00'), clockOutBasis: 'SHIFT_END', expectedClockOutAt: null, timezone: null, location: { id: 'w1', name: 'Main Office' } } }),
      breaks: null,
      lastToday: entry({ clockOutAt: '2026-09-26T16:00:00.000Z' }),
      now: Z('20:00'),
    });
    expect(st.kind).toBe('unconfirmed');
    expect(st.workspace).toBe('Main Office');
  });
});

// ── ⑧ and the frames that know nothing ─────────────────────────────────────
describe('whether the card draws at all (read from the card — it is JSX-side)', () => {
  const card = code('components/home/shift-clock-card.tsx');
  it('nothing before the first answer', () =>
    expect(card).toMatch(/if \(shift\.source === 'pending'\) return null;/));
  it('clocked out waits for today\'s total, on the clock never does', () =>
    expect(card).toMatch(/if \(!status\?\.isClockedIn && !totals\.ready\) return null;/));
  it('an away grant is somewhere to clock in', () =>
    expect(card).toMatch(/somewhereToClockIn = \(status\?\.assignedLocations\?\.length \?\? 0\) > 0 \|\| !!user\?\.allowRemote/));
  it('⑧ hides only when KNOWN, not on the clock, and nothing left open (⑦ still draws)', () =>
    expect(card).toMatch(/if \(known && !somewhereToClockIn && !status\?\.isClockedIn && st\.kind !== 'unconfirmed'\) return null;/));
  it('offline with nothing kept (`none`) is not known', () =>
    expect(card).toMatch(/const known = shift\.source !== 'none' && shift\.source !== 'pending';/));
});

// ── ⑤ queued ───────────────────────────────────────────────────────────────
describe('⑤ — queued is a chip on ②, not a state', () => {
  it('keeps ② and raises the flag', () => {
    const st = readShiftState({ status: on(entry({ breakPlan: [] })), breaks: null, queued: true, now: Z('22:00') });
    expect(st.kind).toBe('working');
    expect(st.queued).toBe(true);
  });
  it('the card shows the chip and the caption for it', () => {
    const card = code('components/home/shift-clock-card.tsx');
    expect(card).toMatch(/st\.queued \? <Chip label=\{t\('shiftClock\.queued'/);
    expect(card).toMatch(/st\.queued && live/);
  });
});

// ── the labels ─────────────────────────────────────────────────────────────
describe('what a target reads as', () => {
  it.each([[480, '8h'], [450, '7h 30m'], [380, '6h 20m'], [600, '10h'], [45, '45m'], [0, '0h']])('%i → %s', (m, s) => {
    expect(targetLabel(m)).toBe(s);
  });
  it('the card no longer rounds a target to whole hours', () => {
    const card = code('components/home/shift-clock-card.tsx');
    expect(card).not.toMatch(/Math\.round\(st\.progress\.target \/ 60\)/);
    expect(card).toMatch(/target: targetLabel\(st\.progress\.target\)/);
  });
  it('heroParts pads minutes only after an hour', () => {
    expect(heroParts(5)).toEqual([{ value: '5', unit: 'm' }]);
    expect(heroParts(65)).toEqual([{ value: '1', unit: 'h' }, { value: '05', unit: 'm' }]);
  });
});

describe('working days left', () => {
  it('counts Monday to Friday including today', () => {
    // Sat 26 Sep 2026 → Mon 28, Tue 29, Wed 30
    expect(workingDaysLeftIn(new Date(2026, 8, 26, 12))).toBe(3);
    // Sun 25 Oct 2026 — the DST day itself — → Mon 26 … Fri 30
    expect(workingDaysLeftIn(new Date(2026, 9, 25, 12))).toBe(5);
  });
});
