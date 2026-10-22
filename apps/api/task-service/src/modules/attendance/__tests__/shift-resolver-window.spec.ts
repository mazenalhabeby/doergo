import { Test, TestingModule } from '@nestjs/testing';
import { ShiftResolverService } from '../core/shift-resolver.service';
import { PrismaService } from '@hbcfield/shared';
import { WorkModel } from '@hbcfield/shared';

/**
 * Which shift INSTANCE a clock-in belongs to.
 *
 * Two audit findings, pinned as a table:
 *   • A clock-in after the shift had already ended still bound to it — counted
 *     ≈ 0, flagged late, and the "you should have left" reminder fired at once.
 *   • The tail of a night shift was checked against TODAY's weekday: a Friday
 *     22:00 shift's 01:00 Saturday tail read as unscheduled on a Mon–Fri rota,
 *     and a Monday 01:00 clock-in bound to a Sunday 22:00 start nobody rostered.
 *
 * Vienna, summer (UTC+2). 2026-08-07 is a Friday.
 */
describe('ShiftResolverService — the instance a clock-in belongs to', () => {
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

  const assignment = (id: string, hours: { startLocal: string; endLocal: string; crossesMidnight: boolean; flagToleranceMin?: number }, over: Record<string, unknown> = {}) => ({
    id: `sa-${id}`,
    userId: 'u-1',
    spaceId: 'sp-1',
    shiftId: id,
    recurrence: 'DAILY',
    daysOfWeek: [] as number[],
    daysOfMonth: [] as number[],
    dates: [] as Date[],
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    priority: 0,
    isActive: true,
    shift: { id, isActive: true, graceMin: 5, reminderIntervalMin: 5, maxReminders: 3, ...hours },
    ...over,
  });

  const DAY = { startLocal: '09:00', endLocal: '17:00', crossesMidnight: false };
  const NIGHT = { startLocal: '22:00', endLocal: '06:00', crossesMidnight: true };
  const MON_FRI = { recurrence: 'WEEKLY', daysOfWeek: [1, 2, 3, 4, 5] };

  const cases: Array<{
    name: string;
    rota: ReturnType<typeof assignment>[];
    at: string;
    expect: null | { shiftId: string; start: string; end: string };
  }> = [
    {
      name: 'day shift, clocked in during it → binds',
      rota: [assignment('day', DAY)],
      at: '2026-08-07T08:00:00Z', // 10:00
      expect: { shiftId: 'day', start: '2026-08-07T07:00:00.000Z', end: '2026-08-07T15:00:00.000Z' },
    },
    {
      name: 'day shift, a few minutes after its end (inside the tolerance) → still binds',
      rota: [assignment('day', DAY)],
      at: '2026-08-07T15:05:00Z', // 17:05
      expect: { shiftId: 'day', start: '2026-08-07T07:00:00.000Z', end: '2026-08-07T15:00:00.000Z' },
    },
    {
      name: 'day shift, after its end + tolerance → does NOT bind',
      rota: [assignment('day', DAY)],
      at: '2026-08-07T15:30:00Z', // 17:30
      expect: null,
    },
    {
      name: "day shift, after its end but inside the shift's own (wider) tolerance → binds",
      rota: [assignment('day', { ...DAY, flagToleranceMin: 45 })],
      at: '2026-08-07T15:30:00Z', // 17:30
      expect: { shiftId: 'day', start: '2026-08-07T07:00:00.000Z', end: '2026-08-07T15:00:00.000Z' },
    },
    {
      name: 'an ended morning shift falls through to the afternoon one',
      rota: [
        assignment('early', { startLocal: '06:00', endLocal: '14:00', crossesMidnight: false }, { priority: 10 }),
        assignment('late', { startLocal: '15:00', endLocal: '23:00', crossesMidnight: false }, { priority: 1 }),
      ],
      at: '2026-08-07T12:55:00Z', // 14:55
      expect: { shiftId: 'late', start: '2026-08-07T13:00:00.000Z', end: '2026-08-07T21:00:00.000Z' },
    },
    {
      name: 'night shift, evening part → tonight → tomorrow morning',
      rota: [assignment('night', NIGHT, MON_FRI)],
      at: '2026-08-07T20:05:00Z', // Fri 22:05
      expect: { shiftId: 'night', start: '2026-08-07T20:00:00.000Z', end: '2026-08-08T04:00:00.000Z' },
    },
    {
      name: "night shift tail Fri→Sat on a Mon–Fri rota → Friday's instance",
      rota: [assignment('night', NIGHT, MON_FRI)],
      at: '2026-08-07T23:00:00Z', // Sat 01:00
      expect: { shiftId: 'night', start: '2026-08-07T20:00:00.000Z', end: '2026-08-08T04:00:00.000Z' },
    },
    {
      name: 'Monday 01:00 on a Mon–Fri night rota → no Sunday instance, no bind',
      rota: [assignment('night', NIGHT, MON_FRI)],
      at: '2026-08-09T23:00:00Z', // Mon 2026-08-10 01:00
      expect: null,
    },
    {
      name: 'Monday 23:00 on a Mon–Fri night rota → Monday night',
      rota: [assignment('night', NIGHT, MON_FRI)],
      at: '2026-08-10T21:00:00Z', // Mon 23:00
      expect: { shiftId: 'night', start: '2026-08-10T20:00:00.000Z', end: '2026-08-11T04:00:00.000Z' },
    },
    {
      name: "night shift tail Sat→Sun on a Mon–Fri rota → Saturday's instance does not exist",
      rota: [assignment('night', NIGHT, MON_FRI)],
      at: '2026-08-08T23:00:00Z', // Sun 01:00
      expect: null,
    },
  ];

  it.each(cases)('$name', async (c) => {
    prisma.shiftAssignment.findMany.mockResolvedValue(c.rota);
    const res = await service.resolveForClockIn({
      userId: 'u-1',
      space: { id: 'sp-1', timezone: 'Europe/Vienna', workModel: WorkModel.SHIFT, lat: 48.2, lng: 16.37 },
      clockInAt: new Date(c.at),
    });
    if (c.expect === null) {
      expect(res).toBeNull();
      return;
    }
    expect(res).not.toBeNull();
    expect(res!.shiftId).toBe(c.expect.shiftId);
    expect(res!.expectedClockInAt.toISOString()).toBe(c.expect.start);
    expect(res!.expectedClockOutAt.toISOString()).toBe(c.expect.end);
  });

  describe('legacy weekly schedule (TechnicianSchedule)', () => {
    const monday = { technicianId: 'u-1', dayOfWeek: 1, startTime: '08:00', endTime: '16:00', isActive: true };
    const fixedSpace = { id: 'sp-1', timezone: 'Europe/Vienna', workModel: WorkModel.FIXED, lat: 48.2, lng: 16.37 };

    it.each([
      { name: 'during the hours → binds', at: '2026-08-10T08:00:00Z', binds: true },
      { name: 'inside the tolerance after the end → binds', at: '2026-08-10T14:05:00Z', binds: true },
      { name: 'after the end + tolerance → does NOT bind', at: '2026-08-10T14:30:00Z', binds: false },
    ])('$name', async ({ at, binds }) => {
      prisma.technicianSchedule.findFirst.mockResolvedValue(monday);
      const res = await service.resolveForClockIn({ userId: 'u-1', space: fixedSpace, clockInAt: new Date(at) });
      if (!binds) {
        expect(res).toBeNull();
        return;
      }
      expect(res!.source).toBe('schedule');
      expect(res!.expectedClockInAt.toISOString()).toBe('2026-08-10T06:00:00.000Z');
      expect(res!.expectedClockOutAt.toISOString()).toBe('2026-08-10T14:00:00.000Z');
    });
  });

  it('materialization keeps the same window (no-show detection reads it)', () => {
    const w = service.matchAndWindowForDate(
      { recurrence: 'WEEKLY', daysOfWeek: [5], daysOfMonth: [], dates: [], shift: NIGHT },
      'Europe/Vienna',
      '2026-08-07',
    );
    expect(w).toEqual({
      expectedClockInAt: new Date('2026-08-07T20:00:00.000Z'),
      expectedClockOutAt: new Date('2026-08-08T04:00:00.000Z'),
    });
  });
});
