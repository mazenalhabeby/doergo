/**
 * The automatic clock for people with NO fixed shift — clocked by arriving and
 * leaving (shared attendance/auto-clock.ts). Juan at AGRU: called in, nights,
 * starting 20:00–22:00, about ten hours.
 */
import {
  AUTO_CLOCK_DEFAULTS,
  autoClockActive,
  autoClockOutAfterEnd,
  clocksByPresence,
  decidePresenceClockIn,
  noShiftReminderAt,
  parseAutoClockStartWindow,
  presenceClockInAllowed,
  presenceCloseDue,
  presenceSessionEnd,
  seenOnSiteRecently,
  startWindowAround,
  suggestStartWindow,
  type MemberAutoClockSettings,
} from '@hbcfield/shared';
import { provisionalClockOut } from '../core/open-shift-close';

const TZ = 'America/Los_Angeles';
// 2026-10-12 is PDT (UTC-7): 20:00 local = 03:00Z next day.
const local = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-07:00`);
const S = (over: Partial<MemberAutoClockSettings> = {}): MemberAutoClockSettings => ({
  ...AUTO_CLOCK_DEFAULTS,
  enabled: true,
  dwellMinutes: 10,
  exitGraceMinutes: 20,
  mode: 'PRESENCE',
  startWindow: { from: '19:00', to: '23:00' },
  noShiftMinutes: 600,
  noShiftLimit: false,
  ...over,
});

describe('who is clocked by arriving and leaving', () => {
  it('the member mode and usual hours come from the assignment; the hours from the workspace, live', () => {
    const s = autoClockActive({
      consentAt: '2026-10-01', settings: { enabled: true }, assignmentAutoClock: true,
      mode: 'PRESENCE', startWindow: { from: '19:00', to: '23:00' }, noShiftDailyMinutes: 660, noShiftPolicy: 'ALLOW',
    })!;
    expect(s).toMatchObject({ mode: 'PRESENCE', startWindow: { from: '19:00', to: '23:00' }, noShiftMinutes: 660, noShiftLimit: false });
  });
  it('anything else reads as by shift; a malformed stored window as any time', () => {
    const s = autoClockActive({ consentAt: '2026-10-01', settings: { enabled: true }, assignmentAutoClock: true, mode: 'nonsense', startWindow: { from: '7' } })!;
    expect(s).toMatchObject({ mode: 'SHIFT', startWindow: null, noShiftMinutes: 480 });
  });
  it('a submitted window is checked strictly', () => {
    expect(parseAutoClockStartWindow({ from: '19:00', to: '19:00' }, { strict: true }).ok).toBe(false);
    expect(parseAutoClockStartWindow({ from: '25:00', to: '03:00' }, { strict: true }).ok).toBe(false);
    expect(parseAutoClockStartWindow(null, { strict: true })).toEqual({ ok: true, value: null });
  });
  it('a rota day is a shift day: only an entry with no planned start goes by presence', () => {
    expect(clocksByPresence(S(), { expectedClockInAt: null })).toBe(true);
    expect(clocksByPresence(S(), { expectedClockInAt: new Date() })).toBe(false);
    expect(clocksByPresence(S({ mode: 'SHIFT' }), { expectedClockInAt: null })).toBe(false);
  });
});

describe('usual hours', () => {
  it('a window crossing midnight holds 01:00', () => {
    const w = startWindowAround({ from: '19:00', to: '03:00' }, TZ, local('2026-10-13', '01:00'))!;
    expect(w.start).toEqual(local('2026-10-12', '19:00'));
    expect(w.end).toEqual(local('2026-10-13', '03:00'));
    expect(startWindowAround({ from: '19:00', to: '23:00' }, TZ, local('2026-10-12', '14:00'))).toBeNull();
  });
  it('Juan’s starts suggest 19:00–23:30', () => {
    const starts = ['21:08', '21:10', '21:03', '20:02', '20:25', '20:05', '22:03', '20:00'].map((h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3)));
    expect(suggestStartWindow(starts)).toEqual({ from: '19:00', to: '23:30' });
  });
  it('starts around midnight make a short window, not a day', () => {
    expect(suggestStartWindow([23 * 60 + 30, 23 * 60 + 50, 10, 20, 40])).toEqual({ from: '22:30', to: '02:00' });
  });
  it('too few, or all over the clock → any time', () => {
    expect(suggestStartWindow([1200, 1210])).toBeNull();
    expect(suggestStartWindow([0, 300, 600, 900, 1200])).toBeNull();
  });
});

describe('arriving', () => {
  const enteredAt = local('2026-10-12', '20:58');
  it('inside his hours: clocked in from the arrival once the dwell has passed', () => {
    expect(decidePresenceClockIn({ settings: S(), now: local('2026-10-12', '21:02'), enteredAt, stillInside: true, timezone: TZ, alreadyClockedIn: false }))
      .toEqual({ action: 'WAIT', until: local('2026-10-12', '21:08') });
    expect(decidePresenceClockIn({ settings: S(), now: local('2026-10-12', '21:09'), enteredAt, stillInside: true, timezone: TZ, alreadyClockedIn: false }))
      .toEqual({ action: 'CLOCK_IN', at: enteredAt });
  });
  it('arriving at 22:55 still counts though the dwell — or a late wake — runs past 23:00', () => {
    const e = local('2026-10-12', '22:55');
    for (const now of [local('2026-10-12', '23:06'), local('2026-10-13', '01:30')]) {
      expect(decidePresenceClockIn({ settings: S(), now, enteredAt: e, stillInside: true, timezone: TZ, alreadyClockedIn: false })).toEqual({ action: 'CLOCK_IN', at: e });
    }
  });
  it('a daytime pick-up is asked, never clocked', () => {
    expect(decidePresenceClockIn({ settings: S(), now: local('2026-10-12', '14:15'), enteredAt: local('2026-10-12', '14:00'), stillInside: true, timezone: TZ, alreadyClockedIn: false }))
      .toEqual({ action: 'ASK' });
  });
  it('no usual hours = any time', () => {
    const e = local('2026-10-12', '14:00');
    expect(decidePresenceClockIn({ settings: S({ startWindow: null }), now: local('2026-10-12', '14:11'), enteredAt: e, stillInside: true, timezone: TZ, alreadyClockedIn: false }))
      .toEqual({ action: 'CLOCK_IN', at: e });
  });
  it('the server marks only what the phone was allowed to decide', () => {
    expect(presenceClockInAllowed(S(), local('2026-10-12', '20:58'), TZ)).toBe(true);
    expect(presenceClockInAllowed(S(), local('2026-10-12', '14:00'), TZ)).toBe(false);
  });
});

describe('leaving', () => {
  const clockInAt = local('2026-10-12', '20:58');
  it('any departure after clocking in is going home (planned end = the clock-in)', () => {
    expect(autoClockOutAfterEnd(S(), local('2026-10-12', '23:30'), clockInAt)).toBe(true);
    expect(autoClockOutAfterEnd(S(), local('2026-10-12', '20:50'), clockInAt)).toBe(false);
  });
  it('his course is the workspace’s hours', () => {
    expect(presenceSessionEnd(clockInAt, S({ noShiftMinutes: 480 }))).toEqual(local('2026-10-13', '04:58'));
  });
});

describe('closing for review — only when he is gone', () => {
  const clockInAt = local('2026-10-12', '21:00');
  const base = { clockInAt, settings: S({ noShiftMinutes: 600, closeAfterMinutes: 60 }) };
  it('still on site and heard from: never closed', () => {
    const now = local('2026-10-13', '08:30');
    expect(presenceCloseDue({ ...base, now, leftSiteAt: null, lastSeenAt: local('2026-10-13', '08:25'), presence: 'ON_SITE' }).due).toBe(false);
  });
  it('the phone went silent on site: closed at the last moment it saw him there', () => {
    const now = local('2026-10-13', '08:30');
    const v = presenceCloseDue({ ...base, now, leftSiteAt: null, lastSeenAt: local('2026-10-13', '07:00'), presence: 'ON_SITE' });
    expect(v).toEqual({ due: true, lastSeenOnSiteAt: local('2026-10-13', '07:00') });
    expect(provisionalClockOut({ clockInAt, expectedClockOutAt: null, leftSiteAt: null, lastSeenOnSiteAt: v.lastSeenOnSiteAt, now }))
      .toEqual({ at: local('2026-10-13', '07:00'), basis: 'LAST_SEEN' });
  });
  it('not before his hours + the grace', () => {
    expect(presenceCloseDue({ ...base, now: local('2026-10-13', '07:30'), leftSiteAt: null, lastSeenAt: null, presence: null }).due).toBe(false);
  });
  it('on a job (FIELD) with a fresh heartbeat is not gone: never closed', () => {
    const now = local('2026-10-13', '08:30');
    const v = presenceCloseDue({
      ...base, now, leftSiteAt: null, lastSeenAt: local('2026-10-13', '08:25'), presence: 'FIELD',
      presenceAt: local('2026-10-13', '06:10'),
    });
    expect(v.due).toBe(false);
  });
  it('REMOTE is gone: closed at the moment presence moved off site', () => {
    const now = local('2026-10-13', '08:30');
    const v = presenceCloseDue({
      ...base, now, leftSiteAt: null, lastSeenAt: local('2026-10-13', '08:25'), presence: 'REMOTE',
      presenceAt: local('2026-10-13', '06:10'),
    });
    expect(v).toEqual({ due: true, lastSeenOnSiteAt: local('2026-10-13', '06:10') });
  });
  it('FIELD and the phone silent: gone, ending when they left the site', () => {
    const now = local('2026-10-13', '08:30');
    const v = presenceCloseDue({
      ...base, now, leftSiteAt: null, lastSeenAt: local('2026-10-13', '07:00'), presence: 'FIELD',
      presenceAt: local('2026-10-13', '06:10'),
    });
    expect(v).toEqual({ due: true, lastSeenOnSiteAt: local('2026-10-13', '06:10') });
  });
  it('seenOnSiteRecently: ON_SITE heard within closeAfterMinutes, nothing else', () => {
    const now = local('2026-10-13', '08:30');
    const s = S({ closeAfterMinutes: 60 });
    expect(seenOnSiteRecently({ presence: 'ON_SITE', lastSeenAt: local('2026-10-13', '08:00') }, s, now)).toBe(true);
    expect(seenOnSiteRecently({ presence: 'ON_SITE', lastSeenAt: local('2026-10-13', '07:00') }, s, now)).toBe(false);
    expect(seenOnSiteRecently({ presence: 'FIELD', lastSeenAt: local('2026-10-13', '08:25') }, s, now)).toBe(false);
    expect(seenOnSiteRecently({ presence: 'ON_SITE', lastSeenAt: null }, s, now)).toBe(false);
  });
  it('seen leaving beats last seen', () => {
    expect(provisionalClockOut({ clockInAt, expectedClockOutAt: null, leftSiteAt: local('2026-10-13', '06:40'), lastSeenOnSiteAt: local('2026-10-13', '07:00'), now: local('2026-10-13', '09:00') }).basis).toBe('LEFT_SITE');
  });
});

describe('the workspace’s hours, never a fixed eight', () => {
  const clockInAt = new Date('2026-10-12T08:00:00Z');
  it('the first "forgot to clock out?" and the no-evidence fallback follow them', () => {
    expect(noShiftReminderAt(clockInAt, 600)).toEqual(new Date('2026-10-12T18:00:00Z'));
    expect(noShiftReminderAt(clockInAt, null)).toEqual(new Date('2026-10-12T16:00:00Z'));
    expect(provisionalClockOut({ clockInAt, expectedClockOutAt: null, leftSiteAt: null, fallbackMinutes: 720, now: new Date('2026-10-13T12:00:00Z') }))
      .toEqual({ at: new Date('2026-10-12T20:00:00Z'), basis: 'CLOCK_IN_PLUS_8H' });
  });
});
