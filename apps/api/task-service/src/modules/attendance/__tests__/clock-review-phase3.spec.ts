import { applyNoShiftAllowance } from '../clock-in/clock-in-no-shift';
import { appendNote, geofenceAtOut } from '../clock-out/clock-out-steps';
import { remindUnansweredExtraTime } from '../extra-time/extra-time-ask';

/** Counting rules from the clock review (2026-10-25): B4, B6, B8, B10. */
describe('clock review — counting rules', () => {
  describe('B4: an offline clock-in at a shift-only workspace', () => {
    const run = async (offline: boolean) => {
      const flagReasons = offline ? ['RECORDED_OFFLINE'] : [];
      const stampCols: any = {};
      const context: any = {
        noShiftAllowanceFor: jest.fn().mockResolvedValue({ kind: 'refused', reason: 'SHIFT_ONLY' }),
      };
      const out = await applyNoShiftAllowance(
        context,
        'u1',
        { timezone: null, organization: { timezone: 'Europe/Vienna' } } as any,
        { id: 's1', name: 'Warehouse', timezone: 'Europe/Vienna' } as any,
        null,
        new Date('2026-10-25T07:00:00Z'),
        { dayRequests: [], stampCols, flagReasons },
      );
      return { out, flagReasons, stampCols };
    };

    it('is kept as a day without a shift — never the daily-hours marker it does not have', async () => {
      const { out, flagReasons, stampCols } = await run(true);
      expect(flagReasons).toEqual(['RECORDED_OFFLINE', 'UNSCHEDULED_DAY']);
      expect(out.endIsDailyLimit).toBe(false);
      expect(stampCols.expectedClockOutAt).toBeUndefined();
    });

    it('online it is refused, as before', async () => {
      await expect(run(false)).rejects.toBeTruthy();
    });
  });

  describe('B6: where a clock-out was made', () => {
    const site = { lat: 47.98, lng: 13.82, geofenceRadius: 50, geofencePolygon: null };

    it('a fix coarser than 100 m is NOT JUDGED — never "on site"', () => {
      const out = geofenceAtOut(site, { lat: 47.99, lng: 13.83, accuracy: 2000 });
      expect(out.geofenceEvaluable).toBe(false);
    });

    it('a precise fix far away is outside', () => {
      const out = geofenceAtOut(site, { lat: 48.1, lng: 13.9, accuracy: 10 });
      expect(out.geofenceEvaluable).toBe(true);
      expect(out.withinGeofence).toBe(false);
    });

    it('a workspace with its ring switched off judges nothing', () => {
      const out = geofenceAtOut({ ...site, geofencePolicy: 'NONE' }, { lat: 48.1, lng: 13.9, accuracy: 10 });
      expect(out.geofenceEvaluable).toBe(false);
      expect(out.withinGeofence).toBe(true);
    });
  });

  describe('B8: notes are added to, never replaced', () => {
    it('keeps what the member wrote', () => {
      expect(appendNote('Pump replaced', 'Self-reported clock-out')).toBe('Pump replaced · Self-reported clock-out');
      expect(appendNote(null, 'Self-reported clock-out')).toBe('Self-reported clock-out');
    });
  });

  describe('B10: a request for more time nobody answered', () => {
    const entry = {
      id: 'e1',
      userId: 'w',
      locationId: 's1',
      organizationId: 'o1',
      user: { firstName: 'Mike', lastName: 'Weber' },
      location: { name: 'Warehouse' },
    };
    const deps = (claimed: number) => ({
      prisma: {
        timeEntry: { updateMany: jest.fn().mockResolvedValue({ count: claimed }) },
        user: { findFirst: jest.fn().mockResolvedValue(null) },
      },
      routing: { notifyTargetsFor: jest.fn().mockResolvedValue(['lead']) },
      notificationClient: { emit: jest.fn() },
    });

    it('asks its deciders once more, and stops the timer', async () => {
      const d = deps(1);
      await remindUnansweredExtraTime(d as any, entry);
      expect(d.prisma.timeEntry.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'e1', reminderState: 'OVERTIME_PENDING' },
        data: { nextRemindAt: null },
      });
      const [pattern, payload] = d.notificationClient.emit.mock.calls[0];
      expect(pattern).toBe('attendance_overtime_request');
      expect(payload).toMatchObject({ entryId: 'e1', leaderIds: ['lead'] });
    });

    it('a request answered meanwhile (claim lost) is not asked about again', async () => {
      const d = deps(0);
      await remindUnansweredExtraTime(d as any, entry);
      expect(d.notificationClient.emit).not.toHaveBeenCalled();
    });
  });
});
