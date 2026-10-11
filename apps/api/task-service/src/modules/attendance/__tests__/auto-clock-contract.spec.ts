import {
  AUTO_CLOCK_DEFAULTS,
  INFORMATIONAL_FLAGS,
  autoRestPlan,
  decideAutoClockIn,
  decideAutoClockOut,
  parseAutoClockSettings,
} from '@hbcfield/shared';

/* Automatic clock-in/out (packages/shared/src/attendance/auto-clock.ts). The phone decides with these offline; the server repeats them. */

const on = { ...AUTO_CLOCK_DEFAULTS, enabled: true };
const t = (hhmm: string) => new Date(`2026-10-12T${hhmm}:00Z`);

describe('parseAutoClockSettings', () => {
  it('stored: missing fields take the defaults, off unless enabled is true', () => {
    expect(parseAutoClockSettings(null)).toEqual({ ok: true, value: AUTO_CLOCK_DEFAULTS });
    expect(parseAutoClockSettings({ enabled: 'yes' }).ok && parseAutoClockSettings({ enabled: 'yes' })).toMatchObject({ value: { enabled: false } });
  });
  it('submitted: out of range is REFUSED, never clamped', () => {
    expect(parseAutoClockSettings({ leadMinutes: 500 }, { strict: true })).toEqual({ ok: false, code: 'AUTO_CLOCK_SETTING_INVALID', field: 'leadMinutes' });
    expect(parseAutoClockSettings({ dwellMinutes: 2.5 }, { strict: true }).ok).toBe(false);
  });
  it('stored: out of range falls back to the default', () => {
    const r = parseAutoClockSettings({ leadMinutes: 500, dwellMinutes: 5 });
    expect(r).toMatchObject({ ok: true, value: { leadMinutes: 30, dwellMinutes: 5 } });
  });
  it('autoRestMinutes may be null (off)', () => {
    expect(parseAutoClockSettings({ autoRestMinutes: null }, { strict: true })).toMatchObject({ ok: true, value: { autoRestMinutes: null } });
    expect(parseAutoClockSettings({ autoRestMinutes: 45 }, { strict: true })).toMatchObject({ ok: true, value: { autoRestMinutes: 45 } });
  });
  it('the close must come after the leader is told', () => {
    expect(parseAutoClockSettings({ leaderAfterMinutes: 60, closeAfterMinutes: 60 }, { strict: true }).ok).toBe(false);
  });
});

describe('decideAutoClockIn', () => {
  const base = { settings: on, stillInside: true, shiftStart: t('08:00'), shiftEnd: t('16:30'), alreadyClockedIn: false };
  it('records the moment of ENTRY once the dwell has passed', () => {
    expect(decideAutoClockIn({ ...base, enteredAt: t('07:52'), now: t('07:56') })).toEqual({ action: 'CLOCK_IN', at: t('07:52') });
  });
  it('waits out the dwell (a drive-past is not an arrival)', () => {
    expect(decideAutoClockIn({ ...base, enteredAt: t('07:52'), now: t('07:53') })).toEqual({ action: 'WAIT', until: t('07:55') });
  });
  it('inside before the window opened → the opening is recorded, not the entry', () => {
    expect(decideAutoClockIn({ ...base, enteredAt: t('06:50'), now: t('07:20') })).toEqual({ action: 'WAIT', until: t('07:33') });
    expect(decideAutoClockIn({ ...base, enteredAt: t('06:50'), now: t('07:40') })).toEqual({ action: 'CLOCK_IN', at: t('07:30') });
  });
  it('skips: off, no shift, already in, left again, shift over', () => {
    expect(decideAutoClockIn({ ...base, settings: AUTO_CLOCK_DEFAULTS, enteredAt: t('07:52'), now: t('08:00') })).toMatchObject({ reason: 'OFF' });
    expect(decideAutoClockIn({ ...base, shiftStart: null, enteredAt: t('07:52'), now: t('08:00') })).toMatchObject({ reason: 'NO_SHIFT' });
    expect(decideAutoClockIn({ ...base, alreadyClockedIn: true, enteredAt: t('07:52'), now: t('08:00') })).toMatchObject({ reason: 'ALREADY_CLOCKED_IN' });
    expect(decideAutoClockIn({ ...base, stillInside: false, enteredAt: t('07:52'), now: t('08:00') })).toMatchObject({ reason: 'NOT_INSIDE' });
    expect(decideAutoClockIn({ ...base, enteredAt: t('16:40'), now: t('16:45') })).toMatchObject({ reason: 'SHIFT_OVER' });
  });
});

describe('decideAutoClockOut', () => {
  const base = { settings: on, stillOutside: true, plannedEnd: t('16:30'), clockedIn: true };
  it('records the moment of LEAVING after the grace', () => {
    expect(decideAutoClockOut({ ...base, exitedAt: t('16:41'), now: t('16:52') })).toEqual({ action: 'CLOCK_OUT', at: t('16:41') });
    expect(decideAutoClockOut({ ...base, exitedAt: t('16:41'), now: t('16:45') })).toEqual({ action: 'WAIT', until: t('16:51') });
  });
  it('leaving before the end is an excursion, not going home', () => {
    expect(decideAutoClockOut({ ...base, exitedAt: t('12:00'), now: t('12:30') })).toMatchObject({ reason: 'BEFORE_END' });
  });
  it('back inside / not clocked in / off', () => {
    expect(decideAutoClockOut({ ...base, stillOutside: false, exitedAt: t('16:41'), now: t('16:52') })).toMatchObject({ reason: 'BACK_INSIDE' });
    expect(decideAutoClockOut({ ...base, clockedIn: false, exitedAt: t('16:41'), now: t('16:52') })).toMatchObject({ reason: 'NOT_CLOCKED_IN' });
    expect(decideAutoClockOut({ ...base, settings: AUTO_CLOCK_DEFAULTS, exitedAt: t('16:41'), now: t('16:52') })).toMatchObject({ reason: 'OFF' });
  });
});

describe('autoRestPlan', () => {
  const s = { ...on, autoRestMinutes: 60 };
  it('centred mid-shift for a shift over six hours', () => {
    expect(autoRestPlan({ settings: s, shiftStart: t('08:00'), shiftEnd: t('16:30'), restTaken: false })).toEqual({ startAt: t('11:45'), endAt: t('12:45') });
  });
  it('none: six hours or less, a rest already taken, switched off', () => {
    expect(autoRestPlan({ settings: s, shiftStart: t('08:00'), shiftEnd: t('14:00'), restTaken: false })).toBeNull();
    expect(autoRestPlan({ settings: s, shiftStart: t('08:00'), shiftEnd: t('16:30'), restTaken: true })).toBeNull();
    expect(autoRestPlan({ settings: on, shiftStart: t('08:00'), shiftEnd: t('16:30'), restTaken: false })).toBeNull();
  });
});

it('automatic steps are marked, not suspected', () => {
  for (const f of ['AUTO_CLOCK_IN', 'AUTO_CLOCK_OUT', 'AUTO_REST']) expect(INFORMATIONAL_FLAGS.has(f)).toBe(true);
});
