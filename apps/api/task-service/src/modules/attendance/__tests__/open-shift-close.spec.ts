/**
 * Shifts left open: closed with a temporary time, replaced by the real one.
 */
import { AttendanceService } from '../attendance.service';
import { isAbandoned, provisionalClockOut } from '../open-shift-close';

const at = (iso: string) => new Date(`2026-09-${iso}:00.000Z`);
const H = 3_600_000;

describe('the temporary clock-out', () => {
  const clockInAt = at('14T08:00');
  const end = at('14T17:00');
  const now = at('15T06:00');

  it('uses the moment the member left the site, when that is known', () => {
    expect(provisionalClockOut({ clockInAt, expectedClockOutAt: end, leftSiteAt: at('14T15:20'), now })).toEqual({ at: at('14T15:20'), basis: 'LEFT_SITE' });
  });

  it('never counts past the shift end, even when they left later', () => {
    expect(provisionalClockOut({ clockInAt, expectedClockOutAt: end, leftSiteAt: at('14T19:00'), now }).at).toEqual(end);
  });

  it('otherwise the shift end', () => {
    expect(provisionalClockOut({ clockInAt, expectedClockOutAt: end, leftSiteAt: null, now })).toEqual({ at: end, basis: 'SHIFT_END' });
  });

  it('with no planned end, clock-in + 8 hours', () => {
    expect(provisionalClockOut({ clockInAt, expectedClockOutAt: null, leftSiteAt: null, now })).toEqual({ at: at('14T16:00'), basis: 'CLOCK_IN_PLUS_8H' });
  });

  it('is never before clock-in', () => {
    expect(provisionalClockOut({ clockInAt, expectedClockOutAt: end, leftSiteAt: at('14T07:00'), now })).toEqual({ at: end, basis: 'SHIFT_END' });
  });

  it('is due 12 hours after a planned end, 24 hours after an unplanned clock-in', () => {
    expect(isAbandoned({ clockInAt, expectedClockOutAt: end }, new Date(end.getTime() + 12 * H))).toBe(true);
    expect(isAbandoned({ clockInAt, expectedClockOutAt: end }, new Date(end.getTime() + 11 * H))).toBe(false);
    expect(isAbandoned({ clockInAt, expectedClockOutAt: null }, new Date(clockInAt.getTime() + 24 * H))).toBe(true);
    expect(isAbandoned({ clockInAt, expectedClockOutAt: null }, new Date(clockInAt.getTime() + 23 * H))).toBe(false);
  });
});

describe('closeAbandonedShifts', () => {
  const now = at('15T06:00');
  function service(entries: any[], claimCount = 1) {
    const svc = Object.create(AttendanceService.prototype) as any;
    svc.logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn() };
    const tx = {
      timeEntry: { updateMany: jest.fn().mockResolvedValue({ count: claimCount }) },
      break: { update: jest.fn() },
      geofenceExcursion: { updateMany: jest.fn() },
    };
    svc.prisma = {
      timeEntry: { findMany: jest.fn().mockResolvedValue(entries) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    svc.countedTime = { columnsFor: jest.fn().mockResolvedValue({ countedStartAt: at('14T08:00'), countedEndAt: at('14T17:00'), paidMinutes: 510 }) };
    svc.notificationClient = { emit: jest.fn() };
    return { svc, tx };
  }
  const entry = (over: any = {}) => ({
    id: 'e1', userId: 'u1', organizationId: 'org-1', clockInAt: at('14T08:00'), expectedClockOutAt: at('14T17:00'),
    breakMinutes: 0, unpaidBreakMinutes: 0, flagReasons: ['LATE_ARRIVAL'], timezone: 'Europe/Vienna', breaks: [], geofenceExcursions: [], location: { name: 'Lager' }, ...over,
  });

  it('asks the database only for open shifts past the limits, in a bounded batch', async () => {
    const { svc } = service([]);
    await svc.closeAbandonedShifts(now);
    const q = svc.prisma.timeEntry.findMany.mock.calls[0][0];
    expect(q.where.status).toBe('CLOCKED_IN');
    expect(q.where.OR[0].expectedClockOutAt.lte).toEqual(new Date(now.getTime() - 12 * H));
    expect(q.where.OR[1]).toMatchObject({ expectedClockOutAt: null, clockInAt: { lte: new Date(now.getTime() - 24 * H) } });
    expect(q.take).toBe(100);
  });

  it('closes with the temporary time, claimed, flagged, waiting for review — and tells the member', async () => {
    const { svc, tx } = service([entry()]);
    const res = await svc.closeAbandonedShifts(now);
    const claim = tx.timeEntry.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: 'e1', status: 'CLOCKED_IN' });
    expect(claim.data).toMatchObject({
      status: 'CLOCKED_OUT', clockOutAt: at('14T17:00'), clockOutProvisional: true, clockOutBasis: 'SHIFT_END',
      approvalStatus: 'PENDING', reminderState: 'RESOLVED', nextRemindAt: null,
    });
    expect(claim.data.flagReasons).toEqual(expect.arrayContaining(['LATE_ARRIVAL', 'MISSED_CLOCK_OUT', 'CLOCK_OUT_PROVISIONAL']));
    expect(svc.notificationClient.emit).toHaveBeenCalledWith('attendance_shift_closed_provisionally', expect.objectContaining({
      entryId: 'e1', userId: 'u1', basis: 'SHIFT_END', clockOutAt: at('14T17:00').toISOString(), timezone: 'Europe/Vienna', locationName: 'Lager',
    }));
    // The site is named in the member's email, so the sweep asks for it in the same read.
    expect(svc.prisma.timeEntry.findMany.mock.calls[0][0].include.location).toEqual({ select: { name: true } });
    expect(res.data).toEqual({ closed: 1 });
  });

  it('ends a rest left running, and stops an excursion escalating about a shift that is over', async () => {
    const { svc, tx } = service([entry({
      breaks: [{ id: 'b1', startedAt: at('14T16:30'), isPaid: false }],
      geofenceExcursions: [{ id: 'x1', leftRingAt: at('14T16:50') }],
    })]);
    await svc.closeAbandonedShifts(now);
    // Left the site at 16:50 → the rest ends there too.
    expect(tx.break.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { endedAt: at('14T16:50'), durationMinutes: 20 } });
    expect(tx.timeEntry.updateMany.mock.calls[0][0].data).toMatchObject({ clockOutBasis: 'LEFT_SITE', breakMinutes: 20, unpaidBreakMinutes: 20 });
    expect(tx.geofenceExcursion.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['x1'] } }, data: { status: 'EXPIRED', resolvedAt: now } });
  });

  it('does nothing when the member clocked out at the same moment', async () => {
    const { svc } = service([entry()], 0);
    const res = await svc.closeAbandonedShifts(now);
    expect(res.data).toEqual({ closed: 0 });
    expect(svc.notificationClient.emit).not.toHaveBeenCalled();
  });
});

describe('overtime added by a manager to a closed shift', () => {
  function service(entry: any) {
    const svc = Object.create(AttendanceService.prototype) as any;
    svc.prisma = {
      timeEntry: { findFirst: jest.fn().mockResolvedValue(entry), update: jest.fn((a: any) => ({ kind: 'entry', a })) },
      overtimeRequest: { findFirst: jest.fn().mockResolvedValue({ cycle: 1 }), create: jest.fn((a: any) => ({ kind: 'round', a })) },
      $transaction: jest.fn(async (ops: any[]) => ops),
    };
    svc.userCanApproveOvertime = jest.fn().mockResolvedValue(true);
    svc.assertNotSelfOvertimeDecision = jest.fn().mockResolvedValue(undefined);
    svc.countedTime = { recomputeClosed: jest.fn() };
    svc.notificationClient = { emit: jest.fn() };
    svc.approveExtraTime = jest.fn().mockResolvedValue({ success: true });
    return svc;
  }
  const closed = { id: 'e1', userId: 'member', locationId: 's1', organizationId: 'org-1', status: 'CLOCKED_OUT', clockInAt: at('14T08:00'), clockOutAt: at('14T18:40'), expectedClockOutAt: at('14T17:00'), overtimeRequests: [] };

  it('records an approved round and counts the minutes after the shift end, capped by the real clock-out', async () => {
    const svc = service(closed);
    await svc.addOvertimeToClosedEntry({ approverId: 'manager', entryId: 'e1', minutes: 90, reason: 'Emergency call-out', organizationId: 'org-1' });
    const [entryUpdate, round] = svc.prisma.$transaction.mock.calls[0][0];
    expect(entryUpdate.a.data).toEqual({ expectedClockOutAt: at('14T18:30') });
    expect(round.a.data).toMatchObject({ status: 'APPROVED', approvalMethod: 'MANAGER', maxDurationMinutes: 90, approverNotes: 'Emergency call-out', cycle: 2 });
    expect(svc.countedTime.recomputeClosed).toHaveBeenCalledWith(expect.objectContaining({ expectedClockOutAt: at('14T18:30') }));
  });

  it('approves the member’s own waiting request instead of adding a second one', async () => {
    const svc = service({ ...closed, overtimeRequests: [{ id: 'r1' }] });
    await svc.addOvertimeToClosedEntry({ approverId: 'manager', entryId: 'e1', minutes: 60, organizationId: 'org-1' });
    expect(svc.approveExtraTime).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'e1', minutes: 60 }));
    expect(svc.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses nonsense and other people’s missing entries', async () => {
    await expect(service(closed).addOvertimeToClosedEntry({ approverId: 'm', entryId: 'e1', minutes: 0, organizationId: 'org-1' })).rejects.toBeDefined();
    await expect(service(null).addOvertimeToClosedEntry({ approverId: 'm', entryId: 'e1', minutes: 30, organizationId: 'org-1' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('"when did you leave?" on a shift closed with a temporary time', () => {
  function service(entry: any, claim = 1) {
    const svc = Object.create(AttendanceService.prototype) as any;
    svc.prisma = {
      timeEntry: {
        findFirst: jest.fn().mockResolvedValue(entry),
        updateMany: jest.fn().mockResolvedValue({ count: claim }),
        update: jest.fn(async ({ data }: any) => ({ id: entry?.id, ...data, location: { name: 'Site' }, user: { firstName: 'K', lastName: 'A' } })),
      },
    };
    svc.countedTime = { columnsFor: jest.fn().mockResolvedValue({ countedStartAt: at('14T08:00'), countedEndAt: at('14T17:00'), paidMinutes: 540 }) };
    svc.notificationClient = { emit: jest.fn() };
    svc.sendPendingApprovalAlert = jest.fn();
    return svc;
  }
  const provisional = {
    id: 'e1', userId: 'u1', organizationId: 'org-1', status: 'CLOCKED_OUT', clockOutProvisional: true,
    clockInAt: at('14T08:00'), clockOutAt: at('14T17:00'), expectedClockOutAt: at('14T17:00'),
    flagReasons: ['MISSED_CLOCK_OUT', 'CLOCK_OUT_PROVISIONAL'], breaks: [], location: { name: 'Site' },
  };

  it('finds the shift whether it is still open or closed with a temporary time', async () => {
    const svc = service(provisional);
    await svc.resolveForgotClockOut({ userId: 'u1', entryId: 'e1', clockOutAt: at('14T18:35').toISOString(), organizationId: 'org-1' });
    expect(svc.prisma.timeEntry.findFirst.mock.calls[0][0].where.OR).toEqual([{ status: 'CLOCKED_IN' }, { status: 'CLOCKED_OUT', clockOutProvisional: true }]);
  });

  it('replaces the temporary time, claimed, keeps "missed clock-out", flags the overtime for a leader', async () => {
    const svc = service(provisional);
    await svc.resolveForgotClockOut({ userId: 'u1', entryId: 'e1', clockOutAt: at('14T18:35').toISOString(), organizationId: 'org-1' });
    expect(svc.prisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', status: 'CLOCKED_OUT', clockOutProvisional: true },
      data: expect.objectContaining({ clockOutAt: at('14T18:35'), clockOutProvisional: false }),
    });
    const data = svc.prisma.timeEntry.update.mock.calls[0][0].data;
    expect(data.flagReasons).toEqual(expect.arrayContaining(['MISSED_CLOCK_OUT', 'OVERTIME']));
    expect(data.flagReasons).not.toContain('CLOCK_OUT_PROVISIONAL');
    expect(data.clockOutProvisional).toBe(false);
  });

  it('is a conflict when the real clock-out won the race', async () => {
    const svc = service(provisional, 0);
    await expect(svc.resolveForgotClockOut({ userId: 'u1', entryId: 'e1', clockOutAt: at('14T18:35').toISOString(), organizationId: 'org-1' }))
      .rejects.toMatchObject({ status: 409 });
  });

  it('refuses a time before a rest in the shift ended', async () => {
    const svc = service({ ...provisional, breaks: [{ endedAt: at('14T17:00') }] });
    await expect(svc.resolveForgotClockOut({ userId: 'u1', entryId: 'e1', clockOutAt: at('14T16:00').toISOString(), organizationId: 'org-1' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'OUT_OF_ORDER' }) });
  });
});
