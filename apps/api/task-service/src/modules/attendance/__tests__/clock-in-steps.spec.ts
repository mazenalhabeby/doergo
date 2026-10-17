import { ATTENDANCE_CONSTANTS, AUTO_CLOCK_IN_FLAG } from '@hbcfield/shared';
import {
  armAutoClockReminder,
  autoClockInFlag,
  gpsAccuracyRefusal,
  outsideSiteRefusal,
  scheduleFlagsAtClockIn,
} from '../clock-in-steps';

describe('clockIn steps', () => {
  it('refuses a fix worse than the threshold, accepts one at it', () => {
    expect(gpsAccuracyRefusal(ATTENDANCE_CONSTANTS.GPS_ACCURACY_THRESHOLD)).toBeNull();
    expect(gpsAccuracyRefusal(undefined)).toBeNull();
    expect(gpsAccuracyRefusal(ATTENDANCE_CONSTANTS.GPS_ACCURACY_THRESHOLD + 1)?.getStatus()).toBe(400);
  });

  it('names which of ceiling or grant refused, with the figures', () => {
    const loc = { name: 'Yard', geofenceRadius: 50 };
    const strict = outsideSiteRefusal('SITE_STRICT', 120.4, loc).getResponse() as any;
    expect(strict).toMatchObject({
      code: 'OUTSIDE_GEOFENCE',
      params: { distanceMetres: 120, radiusMetres: 50, location: 'Yard' },
    });
    const grant = outsideSiteRefusal('NOT_GRANTED', 120.4, loc).getResponse() as any;
    expect(grant.code).toBe('AWAY_NOT_ALLOWED');
  });

  it('UNSCHEDULED_DAY only where the workspace schedules shifts and not by presence', () => {
    const base = {
      planned: false,
      byPresence: false,
      clockInAt: new Date(),
      expectedClockInAt: null,
      toleranceMin: undefined,
    };
    expect(scheduleFlagsAtClockIn({ ...base, workModel: 'SHIFT' })).toEqual(['UNSCHEDULED_DAY']);
    expect(scheduleFlagsAtClockIn({ ...base, workModel: 'NONE' })).toEqual([]);
    expect(scheduleFlagsAtClockIn({ ...base, workModel: 'SHIFT', byPresence: true })).toEqual([]);
  });

  it('late against a planned start', () => {
    const start = new Date('2026-10-17T08:00:00Z');
    const flags = scheduleFlagsAtClockIn({
      planned: true,
      workModel: 'SHIFT',
      byPresence: false,
      clockInAt: new Date('2026-10-17T09:00:00Z'),
      expectedClockInAt: start,
      toleranceMin: 5,
    });
    expect(flags).toContain('LATE_ARRIVAL');
  });

  it('no automatic clock: nothing armed, nothing marked', () => {
    const stamp = { nextRemindAt: new Date(1000), expectedClockOutAt: new Date(5000) };
    armAutoClockReminder(stamp, null, false, new Date(0));
    expect(stamp.nextRemindAt).toEqual(new Date(1000));
    const flag = autoClockInFlag({
      trigger: 'AUTO',
      autoSettings: null,
      withinGeofence: true,
      byPresence: false,
      clockInAt: new Date(0),
      timezone: 'UTC',
      stamp,
    });
    expect(flag).not.toContain(AUTO_CLOCK_IN_FLAG);
  });

  it('the leader reminder is never later than the ordinary one', () => {
    const settings = { leaderAfterMinutes: 30, noShiftMinutes: 480 } as any;
    const end = new Date('2026-10-17T16:00:00Z');
    const early = { expectedClockOutAt: end, nextRemindAt: new Date('2026-10-17T16:10:00Z') };
    armAutoClockReminder(early, settings, false, new Date('2026-10-17T08:00:00Z'));
    expect(early.nextRemindAt).toEqual(new Date('2026-10-17T16:10:00Z'));
    const late = { expectedClockOutAt: end, nextRemindAt: new Date('2026-10-17T18:00:00Z') };
    armAutoClockReminder(late, settings, false, new Date('2026-10-17T08:00:00Z'));
    expect(late.nextRemindAt).toEqual(new Date('2026-10-17T16:30:00Z'));
  });
});
