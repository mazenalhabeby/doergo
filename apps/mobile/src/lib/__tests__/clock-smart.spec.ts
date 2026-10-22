import type { AttendanceStatus, ClockInChoice } from '@hbcfield/shared/client';
import {
  FORGOT_OFFER_AFTER_MIN,
  forgotClockOutOffer,
  forgotOfferDueAt,
  insideOf,
  isAwayRefusal,
  leftSiteAt,
  preferShiftWorkspace,
} from '../clock-smart';
import { readShiftState } from '../../features/home/shift-state';
import { shiftCaption } from '../../features/home/shift-clock/shift-caption';

/** docs/plans/clock-attendance-2026-10.md, step 3 — the phone's smarter day. */
describe('clock-smart', () => {
  const site = (id: string) => ({ id, lat: 0, lng: 0, geofenceRadius: 50 });
  const ask = (...ids: string[]): ClockInChoice<ReturnType<typeof site>> => ({
    kind: 'ask',
    ranked: ids.map((id) => ({ location: site(id), distanceM: null, inside: false })),
  });

  describe('no picker when the shift names the workspace', () => {
    it('takes the shift workspace in AUTO mode', () => {
      const c = preferShiftWorkspace(ask('a', 'b'), 'b', 'AUTO');
      expect(c).toEqual({ kind: 'auto', location: site('b'), why: 'ONLY_ONE' });
    });
    it('still asks a member who chose to always be asked', () => {
      expect(preferShiftWorkspace(ask('a', 'b'), 'b', 'ASK').kind).toBe('ask');
    });
    it('asks when the shift workspace is not one the server would take', () => {
      expect(preferShiftWorkspace(ask('a', 'b'), 'z', 'AUTO').kind).toBe('ask');
    });
    it('changes nothing without a shift', () => {
      const c = ask('a', 'b');
      expect(preferShiftWorkspace(c, null, 'AUTO')).toBe(c);
    });
  });

  it('only an away refusal offers "Ask to clock in from here"', () => {
    expect(isAwayRefusal('OUTSIDE_GEOFENCE')).toBe(true);
    expect(isAwayRefusal('AWAY_NOT_ALLOWED')).toBe(true);
    expect(isAwayRefusal('OUTSIDE_SITE')).toBe(true);
    expect(isAwayRefusal('NO_SHIFT_TODAY')).toBe(false);
    expect(isAwayRefusal(undefined)).toBe(false);
  });

  describe('"You left at … — clock out then?"', () => {
    const entry = (over: Partial<{ leftSiteAt: string | null; expectedClockOutAt: string | null; endIsDailyLimit: boolean }> = {}) => ({
      clockInAt: '2026-10-18T06:00:00.000Z',
      expectedClockOutAt: '2026-10-18T14:30:00.000Z',
      endIsDailyLimit: false,
      leftSiteAt: '2026-10-18T14:42:00.000Z',
      ...over,
    });
    const at = (iso: string) => new Date(iso);

    it('is due 25 min after the later of leaving and the planned end', () => {
      expect(forgotOfferDueAt(entry())?.toISOString()).toBe('2026-10-18T15:07:00.000Z');
      expect(FORGOT_OFFER_AFTER_MIN).toBe(25);
    });
    it('is offered with the moment they left once due', () => {
      expect(forgotClockOutOffer(entry(), at('2026-10-18T15:06:00.000Z'))).toBeNull();
      expect(forgotClockOutOffer(entry(), at('2026-10-18T15:07:00.000Z'))?.leftAt.toISOString()).toBe('2026-10-18T14:42:00.000Z');
    });
    it('left before the end: due 25 min after the planned end, still at the leaving time', () => {
      const e = entry({ leftSiteAt: '2026-10-18T14:00:00.000Z' });
      expect(forgotOfferDueAt(e)?.toISOString()).toBe('2026-10-18T14:55:00.000Z');
      expect(forgotClockOutOffer(e, at('2026-10-18T15:00:00.000Z'))?.leftAt.toISOString()).toBe('2026-10-18T14:00:00.000Z');
    });
    it('never offered without the server saying when they left, without a planned end, or on a daily limit', () => {
      const later = at('2026-10-18T20:00:00.000Z');
      expect(forgotClockOutOffer(entry({ leftSiteAt: null }), later)).toBeNull();
      expect(forgotClockOutOffer(entry({ expectedClockOutAt: null }), later)).toBeNull();
      expect(forgotClockOutOffer(entry({ endIsDailyLimit: true }), later)).toBeNull();
    });
    it('a leaving time before the clock-in is ignored', () => {
      expect(leftSiteAt({ clockInAt: '2026-10-18T06:00:00.000Z', leftSiteAt: '2026-10-18T05:00:00.000Z' })).toBeNull();
    });
  });

  describe('the arrival card', () => {
    const status = (spaceId: string): AttendanceStatus => ({
      isClockedIn: false,
      currentEntry: null,
      assignedLocations: [],
      nextShift: { startAt: '2026-10-18T06:00:00.000Z', endAt: '2026-10-18T14:30:00.000Z', spaceId, spaceName: 'Warehouse' },
    });
    const now = new Date('2026-10-18T05:52:00.000Z');
    const t = ((key: string, o?: Record<string, unknown>) => (o?.defaultValue as string) ?? key) as never;
    const clockOf = () => '08:00';

    it('inside the shift workspace: "You\'re at the Warehouse · your shift starts at 08:00"', () => {
      const st = readShiftState({ status: status('w1'), breaks: null, insideSpaceIds: insideOf({ w1: { inside: true } }), now });
      expect(st.arrived).toBe(true);
      expect(shiftCaption(st, { t, clockOf, live: true, resting: false })).toBe("You're at Warehouse · your shift starts at 08:00");
    });
    it('anywhere else: the usual "starts in" line', () => {
      const st = readShiftState({ status: status('w1'), breaks: null, insideSpaceIds: insideOf({ w2: { inside: true } }), now });
      expect(st.arrived).toBe(false);
      expect(shiftCaption(st, { t, clockOf, live: true, resting: false })).toContain('shiftClock.startsIn');
    });
    it('the phone knowing nothing is the old card', () => {
      expect(readShiftState({ status: status('w1'), breaks: null, now }).arrived).toBe(false);
      expect(insideOf({ w1: { inside: false } }).size).toBe(0);
    });
  });
});
