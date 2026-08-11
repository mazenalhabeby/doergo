import { Test, TestingModule } from '@nestjs/testing';
import { ShiftResolverService } from '../shift-resolver.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkModel } from '@hbcfield/shared';

/**
 * Shift resolver: given a clock-in, resolve the shift and the exact UTC instant
 * it is expected to end. The hard cases are cross-midnight shifts and DST.
 */
describe('ShiftResolverService', () => {
  let service: ShiftResolverService;

  const prisma = {
    shiftAssignment: { findMany: jest.fn() },
    technicianSchedule: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.shiftAssignment.findMany.mockResolvedValue([]);
    prisma.technicianSchedule.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [ShiftResolverService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ShiftResolverService);
  });

  const makeAssignment = (shift: any, over: any = {}) => ({
    id: 'sa-1',
    userId: 'u-1',
    spaceId: 'sp-1',
    shiftId: shift.id,
    recurrence: 'DAILY',
    daysOfWeek: [],
    daysOfMonth: [],
    dates: [],
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    priority: 0,
    isActive: true,
    shift: { isActive: true, graceMin: 5, reminderIntervalMin: 5, maxReminders: 3, ...shift },
    ...over,
  });

  const viennaSpace = { id: 'sp-1', timezone: 'Europe/Vienna', workModel: WorkModel.SHIFT };

  it('short-circuits NONE spaces (attendance off) — no expectation, no query', async () => {
    const none = await service.resolveForClockIn({
      userId: 'u-1',
      space: { id: 'sp-1', timezone: 'Europe/Vienna', workModel: WorkModel.NONE },
      clockInAt: new Date('2026-08-03T07:00:00Z'),
    });
    expect(none).toBeNull();
    expect(prisma.shiftAssignment.findMany).not.toHaveBeenCalled();
  });

  it('per-member: a tracked space with no matching shift resolves to null (task-based member)', async () => {
    // Attendance is ON but this member has no rota/schedule → task-based.
    prisma.shiftAssignment.findMany.mockResolvedValue([]);
    prisma.technicianSchedule.findFirst.mockResolvedValue(null);
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace, // workModel SHIFT
      clockInAt: new Date('2026-08-03T07:00:00Z'),
    });
    expect(res).toBeNull();
    expect(prisma.shiftAssignment.findMany).toHaveBeenCalled(); // it DID resolve per-member
  });

  it('resolves a normal day shift to the same-day local end (summer/DST offset +2)', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment({ id: 'sh-day', startLocal: '09:00', endLocal: '17:00', crossesMidnight: false }),
    ]);
    // Clock in Mon 2026-08-03 at 09:00 Vienna (= 07:00 UTC in summer, +02:00)
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-03T07:00:00Z'),
    });
    expect(res).not.toBeNull();
    expect(res!.shiftId).toBe('sh-day');
    // 17:00 Vienna summer = 15:00 UTC, same day
    expect(res!.expectedClockOutAt.toISOString()).toBe('2026-08-03T15:00:00.000Z');
    // first reminder = end + 5 min grace
    expect(res!.nextRemindAt.toISOString()).toBe('2026-08-03T15:05:00.000Z');
  });

  it('resolves a cross-midnight night shift to NEXT-day local end', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment({ id: 'sh-night', startLocal: '22:00', endLocal: '06:00', crossesMidnight: true }),
    ]);
    // Clock in Mon 2026-08-03 at 22:00 Vienna (= 20:00 UTC summer)
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-03T20:00:00Z'),
    });
    expect(res).not.toBeNull();
    // 06:00 Vienna on 2026-08-04 = 04:00 UTC — NOT 00:00 the same night
    expect(res!.expectedClockOutAt.toISOString()).toBe('2026-08-04T04:00:00.000Z');
    expect(res!.expectedClockOutAt.getTime()).toBeGreaterThan(new Date('2026-08-03T20:00:00Z').getTime());
  });

  it('handles clocking in just after midnight on a night shift (guard bumps forward)', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment({ id: 'sh-night', startLocal: '22:00', endLocal: '06:00', crossesMidnight: true }),
    ]);
    // Clock in Tue 2026-08-04 at 01:00 Vienna (= 2026-08-03T23:00Z) — the worker
    // is in the early-morning tail of the night shift that started 22:00 the 3rd.
    // The end must be 06:00 on the SAME local day (the 4th), i.e. 04:00Z — NOT
    // pushed ~24h to the 5th.
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-03T23:00:00Z'),
    });
    expect(res).not.toBeNull();
    expect(res!.expectedClockOutAt.getTime()).toBeGreaterThan(new Date('2026-08-03T23:00:00Z').getTime());
    expect(res!.expectedClockOutAt.toISOString()).toBe('2026-08-04T04:00:00.000Z');
  });

  it('clocking in shortly BEFORE a cross-midnight evening start is EARLY, not a day late', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment({ id: 'sh-night', startLocal: '18:00', endLocal: '06:00', crossesMidnight: true }),
    ]);
    // Clock in Mon 2026-08-03 at 17:35 Vienna (= 15:35Z summer) — 25 min BEFORE the
    // 18:00 start. Expected start must be TODAY's 18:00 (16:00Z), NOT yesterday's.
    // Regression: computeStart must roll back a day only for the early-morning tail
    // (local < END), not merely local < START — else an early arrival reads ~a day late.
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-03T15:35:00Z'),
    });
    expect(res).not.toBeNull();
    expect(res!.expectedClockInAt.toISOString()).toBe('2026-08-03T16:00:00.000Z');
    // Clock-in precedes the expected start → early, so no LATE_ARRIVAL is possible.
    expect(res!.expectedClockInAt.getTime()).toBeGreaterThan(new Date('2026-08-03T15:35:00Z').getTime());
  });

  it('early-morning tail still anchors a cross-midnight start to YESTERDAY evening (genuinely late)', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment({ id: 'sh-night', startLocal: '18:00', endLocal: '06:00', crossesMidnight: true }),
    ]);
    // Clock in Tue 2026-08-04 at 01:39 Vienna (= 2026-08-03T23:39Z), deep in the
    // overnight tail. Expected start = 18:00 the 3rd (16:00Z) → ~7.6h late (correct).
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-03T23:39:00Z'),
    });
    expect(res).not.toBeNull();
    expect(res!.expectedClockInAt.toISOString()).toBe('2026-08-03T16:00:00.000Z');
    expect(res!.expectedClockInAt.getTime()).toBeLessThan(new Date('2026-08-03T23:39:00Z').getTime());
  });

  it('matches a ONE_OFF date by local calendar day (no tz off-by-one, west of UTC)', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment(
        { id: 'sh-oneoff', startLocal: '09:00', endLocal: '17:00', crossesMidnight: false },
        { recurrence: 'ONE_OFF', dates: [new Date('2026-03-15')] }, // midnight UTC of the picked date
      ),
    ]);
    const laSpace = { id: 'sp-1', timezone: 'America/Los_Angeles', workModel: WorkModel.SHIFT };
    // 2026-03-15 09:00 LA = 16:00Z (PDT, -7). Local date is the 15th → must match.
    const match = await service.resolveForClockIn({
      userId: 'u-1',
      space: laSpace,
      clockInAt: new Date('2026-03-15T16:00:00Z'),
    });
    expect(match?.shiftId).toBe('sh-oneoff');
    // A clock-in on the 14th local must NOT match.
    const noMatch = await service.resolveForClockIn({
      userId: 'u-1',
      space: laSpace,
      clockInAt: new Date('2026-03-14T16:00:00Z'),
    });
    expect(noMatch).toBeNull();
  });

  it('resolves winter DST offset correctly (+01:00)', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment({ id: 'sh-day', startLocal: '09:00', endLocal: '17:00', crossesMidnight: false }),
    ]);
    // Clock in 2026-01-05 09:00 Vienna (winter = +01:00 → 08:00 UTC)
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-01-05T08:00:00Z'),
    });
    // 17:00 Vienna winter = 16:00 UTC
    expect(res!.expectedClockOutAt.toISOString()).toBe('2026-01-05T16:00:00.000Z');
  });

  it('WEEKLY recurrence only matches assigned weekdays', async () => {
    // Fri=5 assigned; clock-in below is a Monday → no match → falls through to null
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment(
        { id: 'sh-fri', startLocal: '22:00', endLocal: '06:00', crossesMidnight: true },
        { recurrence: 'WEEKLY', daysOfWeek: [5] },
      ),
    ]);
    const monday = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-03T20:00:00Z'), // Mon
    });
    expect(monday).toBeNull();

    const friday = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-07T20:00:00Z'), // Fri
    });
    expect(friday).not.toBeNull();
    expect(friday!.shiftId).toBe('sh-fri');
  });

  it('MONTHLY recurrence matches the local day-of-month', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment(
        { id: 'sh-15', startLocal: '09:00', endLocal: '17:00', crossesMidnight: false },
        { recurrence: 'MONTHLY', daysOfMonth: [15] },
      ),
    ]);
    const onThe15th = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-15T07:00:00Z'),
    });
    expect(onThe15th?.shiftId).toBe('sh-15');

    const onThe16th = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-16T07:00:00Z'),
    });
    expect(onThe16th).toBeNull();
  });

  it('picks the highest-priority assignment when several match', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment({ id: 'sh-hi', startLocal: '10:00', endLocal: '18:00', crossesMidnight: false }, { priority: 10 }),
      makeAssignment({ id: 'sh-lo', startLocal: '09:00', endLocal: '17:00', crossesMidnight: false }, { priority: 1 }),
    ]);
    // findMany is ordered by priority desc in the query; the service takes the first match.
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-03T08:00:00Z'),
    });
    expect(res!.shiftId).toBe('sh-hi');
  });

  it('skips inactive shifts', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment({ id: 'sh-off', startLocal: '09:00', endLocal: '17:00', crossesMidnight: false, isActive: false }),
    ]);
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-03T07:00:00Z'),
    });
    expect(res).toBeNull();
  });

  it('falls back to a legacy weekly schedule when no assignment matches', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([]);
    prisma.technicianSchedule.findFirst.mockResolvedValue({
      technicianId: 'u-1',
      dayOfWeek: 1, // Monday
      startTime: '08:00',
      endTime: '16:00',
      isActive: true,
    });
    // Monday 2026-08-03 07:00 Vienna
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: { id: 'sp-1', timezone: 'Europe/Vienna', workModel: WorkModel.FIXED },
      clockInAt: new Date('2026-08-03T06:00:00Z'),
    });
    expect(res).not.toBeNull();
    expect(res!.source).toBe('schedule');
    expect(res!.shiftId).toBeNull();
    // 16:00 Vienna summer = 14:00 UTC
    expect(res!.expectedClockOutAt.toISOString()).toBe('2026-08-03T14:00:00.000Z');
  });

  it('returns null when nothing matches (no assignment, no schedule)', async () => {
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-03T07:00:00Z'),
    });
    expect(res).toBeNull();
  });

  it('honours a per-shift grace period for nextRemindAt', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      makeAssignment({ id: 'sh-day', startLocal: '09:00', endLocal: '17:00', crossesMidnight: false, graceMin: 15 }),
    ]);
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: viennaSpace,
      clockInAt: new Date('2026-08-03T07:00:00Z'),
    });
    // end 15:00Z + 15 min grace
    expect(res!.nextRemindAt.toISOString()).toBe('2026-08-03T15:15:00.000Z');
    expect(res!.graceMin).toBe(15);
  });
});
