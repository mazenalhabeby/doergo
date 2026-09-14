/**
 * A no-show escalation answered by a clock-in that arrived late.
 *
 * A phone with no signal clocks in at 07:58 and sends it at 11:14; the sweep
 * escalated at 08:30. The shift becomes PRESENT either way — the question here is
 * whether the supervisor who was told "hasn't clocked in" is told otherwise.
 */
import { AttendanceService } from '../attendance.service';

const TAP = new Date('2026-09-14T07:58:00.000Z');

function service(escalated: { id: string }[]) {
  const svc = Object.create(AttendanceService.prototype) as any;
  svc.prisma = {
    shiftInstance: {
      findMany: jest.fn().mockResolvedValue(escalated),
      updateMany: jest.fn().mockResolvedValue({ count: escalated.length || 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Karim', lastName: 'Ahmad' }) },
  };
  svc.notificationClient = { emit: jest.fn() };
  svc.notifyTargetsFor = jest.fn().mockResolvedValue(['leader-1', 'leader-2']);
  return svc;
}

const context = { organizationId: 'org-1', recordedOffline: true, timezone: 'Europe/Vienna' };

describe('a late clock-in after a no-show escalation', () => {
  it('marks the shift present and tells the same people the escalation alerted', async () => {
    const svc = service([{ id: 'inst-1' }]);
    await svc.markShiftInstancePresent('u1', 'space-1', 'shift-1', 'entry-1', TAP, context);

    expect(svc.prisma.shiftInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { state: 'PRESENT', nextRemindAt: null, timeEntryId: 'entry-1' } }),
    );
    // Same routing as the escalation: the space's reconcile-attendance people.
    expect(svc.notifyTargetsFor).toHaveBeenCalledWith({ spaceId: 'space-1', organizationId: 'org-1', userId: 'u1' }, 'canReconcileAttendance');
    expect(svc.notificationClient.emit).toHaveBeenCalledWith(
      'attendance_noshow_resolved',
      expect.objectContaining({
        instanceId: 'inst-1',
        userName: 'Karim Ahmad',
        clockInAt: TAP.toISOString(),
        recordedOffline: true,
        leaderIds: ['leader-1', 'leader-2'],
      }),
    );
  });

  it('says nothing when nobody had been alerted', async () => {
    const svc = service([]);
    await svc.markShiftInstancePresent('u1', 'space-1', 'shift-1', 'entry-1', TAP, context);
    expect(svc.prisma.shiftInstance.updateMany).toHaveBeenCalled();
    expect(svc.notificationClient.emit).not.toHaveBeenCalled();
    expect(svc.notifyTargetsFor).not.toHaveBeenCalled();
  });

  it('matches the shift by the time of the TAP, not the time it arrived', async () => {
    const svc = service([]);
    await svc.markShiftInstancePresent('u1', 'space-1', 'shift-1', 'entry-1', TAP, context);
    const where = svc.prisma.shiftInstance.updateMany.mock.calls[0][0].where;
    expect(where.expectedClockInAt.gte.getTime()).toBe(TAP.getTime() - 12 * 3_600_000);
    expect(where.state.in).toContain('ESCALATED');
  });
});
