/**
 * ONE way a shift gets closed (ClockOutService.closeEntry).
 *
 * Before this, only the temporary close of an abandoned shift ended a rest left
 * running and expired the open excursions. A tapped clock-out and "I forgot to
 * clock out" left the rest row open (never subtracted — the member was counted
 * as working through it) and the excursion escalating about a shift that was
 * over; the legacy overtime reject wrote a bare AUTO_OUT with no counted time
 * at all. Every closer now goes through the same steps, and these tests pin
 * each one on each closer.
 */
import { ForbiddenException } from '@nestjs/common';
import { TimeEntryStatus } from '@hbcfield/shared';
import { clockOutServices, type ClockOutServiceParts } from './clock-out.service.fixture';
import { CountedTimeService } from '../core/counted-time.service';
import { clockOutTimeFlags, endRunningRests } from '../core/open-shift-close';
import { overtimeServices } from '../../overtime/__tests__/overtime.service.fixture';

const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00.000Z`);
const location = { id: 'loc-1', name: 'Lager', lat: 47.98, lng: 13.82, geofenceRadius: 50, geofencePolygon: null, timezone: 'Europe/Vienna' };

/** An open shift 08:00–16:00 with a rest started at 12:00 and still running, and one open excursion. */
const openEntry = (over: Record<string, unknown> = {}) => ({
  id: 'e1', userId: 'u1', organizationId: 'org-1', locationId: 'loc-1', status: TimeEntryStatus.CLOCKED_IN,
  clockInAt: at('08:00'), expectedClockInAt: at('08:00'), expectedClockOutAt: at('16:00'), endIsDailyLimit: false,
  shiftId: null, isRemote: false, flagReasons: [], notes: null, reminderState: null, timezone: 'Europe/Vienna',
  breakMinutes: 0, unpaidBreakMinutes: 0, location,
  breaks: [{ id: 'b1', startedAt: at('12:00'), endedAt: null, durationMinutes: null, isPaid: false }],
  geofenceExcursions: [{ id: 'x1', leftRingAt: at('12:05') }],
  ...over,
});

function build(entry: any) {
  const prisma: any = {
    spaceAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(entry),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(async () => ({ ...entry, ...prisma.timeEntry.updateMany.mock.calls.at(-1)[0].data, user: { firstName: 'Mike', lastName: 'Weber' } })),
    },
    break: { update: jest.fn() },
    geofenceExcursion: { updateMany: jest.fn() },
    shift: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Mike', lastName: 'Weber', email: 'm@x' }) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const emit = jest.fn();
  const watchers = { resolveWatchers: jest.fn().mockResolvedValue({ ids: ['w1'], emails: [] }) };
  const routing = { notifyTargetsFor: jest.fn().mockResolvedValue([]) };
  const jobPause = { pauseAtClockOut: jest.fn().mockResolvedValue({ paused: [] }) };
  const svc = clockOutServices(
    prisma,
    { emit } as any,
    watchers as any,
    new CountedTimeService(prisma),
    routing as any,
    { reverseGeocode: jest.fn().mockResolvedValue(null) } as any,
    { requestOvertimeAtClockOut: jest.fn() } as any,
    jobPause as any,
  );
  const claim = () => prisma.timeEntry.updateMany.mock.calls[0][0];
  return { svc, prisma, emit, jobPause, claim };
}

/** Everything a close must do, whichever closer did it. */
function expectFullClose(t: ReturnType<typeof build>, closeAt: Date) {
  // The running rest ends at the close and is subtracted.
  const restMinutes = Math.round((closeAt.getTime() - at('12:00').getTime()) / 60_000);
  expect(t.prisma.break.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { endedAt: closeAt, durationMinutes: restMinutes } });
  const data = t.claim().data;
  expect(data).toMatchObject({ breakMinutes: restMinutes, unpaidBreakMinutes: restMinutes });
  // Counted time is written, net of that rest.
  expect(data.paidMinutes).toBeDefined();
  expect(data.countedEndAt).toBeDefined();
  // Reminders of both kinds are cleared.
  expect(data).toMatchObject({ reminderState: 'RESOLVED', nextRemindAt: null, nextBreakRemindAt: null });
  // The open excursion stops escalating.
  expect(t.prisma.geofenceExcursion.updateMany).toHaveBeenCalledWith({
    where: { id: { in: ['x1'] } },
    data: { status: 'EXPIRED', resolvedAt: expect.any(Date) },
  });
  // Jobs pause at the close; the clock-out is announced through the projector.
  expect(t.jobPause.pauseAtClockOut).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', at: closeAt }));
  expect(t.emit).toHaveBeenCalledWith('attendance_clock_out', expect.objectContaining({
    timeEntry: expect.objectContaining({ entryId: 'e1', at: closeAt.toISOString() }),
  }));
  // One transaction for the claim, the rest and the excursion.
  expect(t.prisma.$transaction).toHaveBeenCalledTimes(1);
}

describe('a tapped clock-out', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(at('15:00'));
  });
  afterAll(() => jest.useRealTimers());

  it('ends a rest still running, subtracts it, and closes the open excursion', async () => {
    const t = build(openEntry());
    await t.svc.clockOut({ userId: 'u1', organizationId: 'org-1', lat: 47.98, lng: 13.82, accuracy: 5, earlyReason: 'Doctor' });
    expectFullClose(t, at('15:00'));
    // 08:00–15:00 is 420 minutes; the 180-minute rest does not count.
    expect(t.claim().data.paidMinutes).toBe(420 - 180);
  });

  it('on an away day, outside the site is neither flagged nor alerted', async () => {
    const t = build(openEntry({ isRemote: true, breaks: [], geofenceExcursions: [] }));
    await t.svc.clockOut({ userId: 'u1', organizationId: 'org-1', lat: 48.2, lng: 16.37, accuracy: 5 });
    expect(t.claim().data.flagReasons).not.toContain('OUTSIDE_GEOFENCE_OUT');
    expect(t.emit.mock.calls.map((c) => c[0])).not.toContain('attendance_geofence_alert');
  });

  it('outside the site on a normal day is still flagged and alerted', async () => {
    const t = build(openEntry({ breaks: [], geofenceExcursions: [] }));
    await t.svc.clockOut({ userId: 'u1', organizationId: 'org-1', lat: 48.2, lng: 16.37, accuracy: 5 });
    expect(t.claim().data.flagReasons).toContain('OUTSIDE_GEOFENCE_OUT');
    expect(t.emit.mock.calls.map((c) => c[0])).toContain('attendance_geofence_alert');
  });
});

describe('"I forgot to clock out"', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(at('20:00'));
  });
  afterAll(() => jest.useRealTimers());

  const forgot = (svc: ClockOutServiceParts, time: string) =>
    svc.resolveForgotClockOut({ userId: 'u1', entryId: 'e1', clockOutAt: at(time).toISOString(), organizationId: 'org-1' });

  it('ends the running rest at the reported time and closes the open excursion', async () => {
    const t = build(openEntry());
    await forgot(t.svc, '15:30');
    expectFullClose(t, at('15:30'));
  });

  it('five minutes past the end is inside the tolerance — not overtime', async () => {
    const t = build(openEntry({ breaks: [], geofenceExcursions: [] }));
    await forgot(t.svc, '16:05');
    expect(t.claim().data.flagReasons).not.toContain('OVERTIME');
    expect(t.claim().data.flagReasons).toContain('MISSED_CLOCK_OUT');
  });

  it('leaving well before the end is an early departure, as on a tapped clock-out', async () => {
    const t = build(openEntry({ breaks: [], geofenceExcursions: [] }));
    await forgot(t.svc, '14:00');
    expect(t.claim().data.flagReasons).toContain('EARLY_DEPARTURE');
  });

  it('past the tolerance it is overtime for a leader', async () => {
    const t = build(openEntry({ breaks: [], geofenceExcursions: [] }));
    const res: any = await forgot(t.svc, '17:00');
    expect(t.claim().data.flagReasons).toContain('OVERTIME');
    expect(res.message).toMatch(/overtime pending approval/);
  });
});

describe('a close by decision (the legacy overtime flow)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(at('17:30'));
  });
  afterAll(() => jest.useRealTimers());

  it('ends the shift at the decision as AUTO_OUT — and counts nothing past the planned end', async () => {
    const t = build(openEntry({
      breaks: [{ id: 'b1', startedAt: at('12:00'), endedAt: at('12:30'), durationMinutes: 30, isPaid: false },
        { id: 'b2', startedAt: at('17:00'), endedAt: null, durationMinutes: null, isPaid: false }],
      notes: 'Started at the warehouse',
    }));
    const closed = await t.svc.closeByDecision({ entryId: 'e1', organizationId: 'org-1', note: 'Overtime rejected: no', reason: 'OFFICE_CLOSE' });
    expect(closed).toBe(true);
    // Only this organization's still-open shift is closed.
    expect(t.prisma.timeEntry.findFirst.mock.calls[0][0].where).toEqual({ id: 'e1', organizationId: 'org-1', status: TimeEntryStatus.CLOCKED_IN });
    const data = t.claim().data;
    expect(data).toMatchObject({ status: TimeEntryStatus.AUTO_OUT, clockOutAt: at('17:30'), approvalStatus: 'PENDING' });
    // The recorded time is the evidence; what counts stops at 16:00: 480 − the 30-minute rest at noon.
    // The rest 17:00–17:30 falls after the counted end, so it is not taken off again (it was 420).
    expect(data.countedEndAt).toEqual(at('16:00'));
    expect(data.paidMinutes).toBe(480 - 30);
    // The rest that was running ends at the decision.
    expect(t.prisma.break.update).toHaveBeenCalledWith({ where: { id: 'b2' }, data: { endedAt: at('17:30'), durationMinutes: 30 } });
    expect(data).toMatchObject({ breakMinutes: 60, unpaidBreakMinutes: 60, reminderState: 'RESOLVED', nextRemindAt: null, nextBreakRemindAt: null });
    expect(data.flagReasons).toEqual(expect.arrayContaining(['MISSED_CLOCK_OUT', 'OVERTIME']));
    // The note is added to what the day already says.
    expect(data.notes).toBe('Started at the warehouse · Overtime rejected: no');
    expect(t.prisma.geofenceExcursion.updateMany).toHaveBeenCalled();
    expect(t.jobPause.pauseAtClockOut).toHaveBeenCalledWith(expect.objectContaining({ reason: 'OFFICE_CLOSE', at: at('17:30') }));
    expect(t.emit).toHaveBeenCalledWith('attendance_clock_out', expect.anything());
  });

  it('is quiet when the shift is no longer open', async () => {
    const t = build(null);
    expect(await t.svc.closeByDecision({ entryId: 'e1', organizationId: 'org-1', note: 'x', reason: 'AUTO_CLOSE' })).toBe(false);
    expect(t.prisma.timeEntry.updateMany).not.toHaveBeenCalled();
  });
});

describe('legacy overtime: a refusal or a time-out never clocks anyone out (decided 2026-10-18)', () => {
  const round = { id: 'ot1', technicianId: 'tech', timeEntryId: 'e1', locationId: 'loc-1', organizationId: 'org-1', status: 'PENDING_APPROVAL' };
  function overtime(opts: { approverIsAdmin?: boolean } = {}) {
    const prisma: any = {
      overtimeRequest: {
        findFirst: jest.fn().mockResolvedValue(round),
        findMany: jest.fn(async ({ where }: any) => (where.status === 'PENDING_APPROVAL' ? [round] : [])),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      timeEntry: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { findFirst: jest.fn().mockResolvedValue(opts.approverIsAdmin ? { id: 'tech' } : null) },
    };
    const clockOuts = { closeByDecision: jest.fn().mockResolvedValue(true) };
    const svc = overtimeServices(prisma, { emit: jest.fn() } as any, {} as any, {} as any, clockOuts as any);
    return { svc, prisma, clockOuts };
  }
  const nudged = (prisma: any) =>
    expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', status: TimeEntryStatus.CLOCKED_IN },
      data: { reminderState: 'REMINDED', reminderCount: 0, nextRemindAt: expect.any(Date) },
    });

  it('a rejection keeps the member clocked in and nudges them — counting stops at the planned end', async () => {
    const { svc, prisma, clockOuts } = overtime();
    await svc.leaderReject({ overtimeRequestId: 'ot1', approverId: 'leader', reason: 'Not needed', organizationId: 'org-1' });
    expect(prisma.overtimeRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ot1', status: 'PENDING_APPROVAL' } }));
    expect(clockOuts.closeByDecision).not.toHaveBeenCalled();
    nudged(prisma);
  });

  it('nobody rejects their own overtime', async () => {
    const { svc, prisma } = overtime();
    await expect(
      svc.leaderReject({ overtimeRequestId: 'ot1', approverId: 'tech', reason: 'x', organizationId: 'org-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.overtimeRequest.updateMany).not.toHaveBeenCalled();
    expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled();
  });

  it('a true org admin is exempt, as everywhere', async () => {
    const { svc, prisma, clockOuts } = overtime({ approverIsAdmin: true });
    await svc.leaderReject({ overtimeRequestId: 'ot1', approverId: 'tech', reason: 'x', organizationId: 'org-1' });
    expect(clockOuts.closeByDecision).not.toHaveBeenCalled();
    nudged(prisma);
  });

  it('a request decided meanwhile is not rejected twice', async () => {
    const { svc, prisma } = overtime();
    prisma.overtimeRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.leaderReject({ overtimeRequestId: 'ot1', approverId: 'leader', reason: 'x', organizationId: 'org-1' })).rejects.toBeDefined();
    expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled();
  });

  it('a lapsed approval window (Path B unconfirmed) is claimed, then nudges — never a clock-out', async () => {
    const { svc, prisma, clockOuts } = overtime();
    await svc.checkTimeouts();
    expect(prisma.overtimeRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'ot1', status: 'PENDING_APPROVAL' }, data: { status: 'EXPIRED_NO_APPROVAL' } });
    expect(clockOuts.closeByDecision).not.toHaveBeenCalled();
    nudged(prisma);
  });
});

describe('the pure rules', () => {
  it('a running rest ends at the close, never after now, never before it began; totals from the rows', () => {
    const rests = [
      { id: 'a', startedAt: at('10:00'), endedAt: at('10:15'), durationMinutes: 15, isPaid: true },
      { id: 'b', startedAt: at('12:00'), endedAt: null, durationMinutes: null, isPaid: false },
    ];
    expect(endRunningRests(rests, at('12:30'), at('20:00'))).toMatchObject({
      ends: [{ id: 'b', endedAt: at('12:30'), minutes: 30 }], breakMinutes: 45, unpaidBreakMinutes: 30,
    });
    // A reported time a little ahead of the server is capped at now.
    expect(endRunningRests(rests, at('12:31'), at('12:20')).ends[0]).toEqual({ id: 'b', endedAt: at('12:20'), minutes: 20 });
    // A close before the rest began is zero, not negative.
    expect(endRunningRests(rests, at('11:00'), at('20:00')).ends[0]).toEqual({ id: 'b', endedAt: at('12:00'), minutes: 0 });
  });

  it('the clock-out time flags honour the tolerance and the daily limit', () => {
    const e = { expectedClockOutAt: at('16:00') };
    expect(clockOutTimeFlags(e, at('16:05'), 10)).toEqual([]);
    expect(clockOutTimeFlags(e, at('16:30'), 10)).toEqual(['OVERTIME']);
    expect(clockOutTimeFlags(e, at('15:00'), 10)).toEqual(['EARLY_DEPARTURE']);
    expect(clockOutTimeFlags({ ...e, endIsDailyLimit: true }, at('15:00'), 10)).toEqual([]);
    expect(clockOutTimeFlags({ ...e, endIsDailyLimit: true }, at('16:30'), 10)).toEqual(['PAST_DAILY_LIMIT']);
    expect(clockOutTimeFlags({ expectedClockOutAt: null }, at('23:00'), 10)).toEqual([]);
  });
});
