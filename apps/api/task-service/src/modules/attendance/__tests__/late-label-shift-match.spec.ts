import { Test } from '@nestjs/testing';
import { WorkModel } from '@hbcfield/shared';
import { ShiftResolverService } from '../core/shift-resolver.service';
import { PrismaService } from '@hbcfield/shared';

/**
 * "Late" on somebody who was early — when the WRONG shift instance is matched.
 *
 * The resolver walks the rota rows by priority and binds the FIRST one whose
 * instance has not ended (past its tolerance). With two shifts in a day it can
 * bind the one that is finishing, not the one the person came for, and the
 * clock-in is then judged against the earlier start.
 *
 * Fixed by chooseShiftInstance (labels/rules-time.ts): the instance the
 * clock-in falls in, else the next to start, never one already over.
 */
describe('late label — which shift a clock-in is matched to', () => {
  const prisma = { shiftAssignment: { findMany: jest.fn() }, technicianSchedule: { findFirst: jest.fn() } };
  let resolver: ShiftResolverService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.technicianSchedule.findFirst.mockResolvedValue(null);
    const ref = await Test.createTestingModule({
      providers: [ShiftResolverService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    resolver = ref.get(ShiftResolverService);
  });

  const row = (id: string, startLocal: string, endLocal: string, crossesMidnight = false) => ({
    id: `sa-${id}`,
    userId: 'u-1',
    spaceId: 'sp-1',
    shiftId: id,
    recurrence: 'DAILY',
    daysOfWeek: [],
    daysOfMonth: [],
    dates: [],
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    priority: 0,
    isActive: true,
    shift: {
      id,
      startLocal,
      endLocal,
      crossesMidnight,
      isActive: true,
      flagToleranceMin: 10,
      graceMin: 5,
      reminderIntervalMin: 5,
      maxReminders: 3,
    },
  });
  const space = { id: 'sp-1', timezone: 'Europe/Vienna', workModel: WorkModel.SHIFT, lat: 47.98, lng: 13.83 };

  // Tue 13 Oct 2026, Vienna = UTC+2.
  it('split day 08:00–12:00 + 13:00–17:00: back at 12:05 is the AFTERNOON shift', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([row('am', '08:00', '12:00'), row('pm', '13:00', '17:00')]);
    const res = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-10-13T10:05:00Z') });
    expect(res?.shiftId).toBe('pm');
  });

  it('night 22:00–06:00 + day 07:00–15:00: arriving at 06:05 is the DAY shift', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([
      row('night', '22:00', '06:00', true),
      row('day', '07:00', '15:00'),
    ]);
    const res = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-10-13T04:05:00Z') });
    expect(res?.shiftId).toBe('day');
  });

  it('a single rota row resolves exactly as before (early, on time, just after the end)', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([row('am', '08:00', '12:00')]);
    for (const iso of ['2026-10-13T05:50:00Z', '2026-10-13T06:20:00Z', '2026-10-13T10:05:00Z']) {
      const res = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date(iso) });
      expect(res?.shiftId).toBe('am');
    }
  });

  it('night shift alone: 21:50 and 01:00 are the same night', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([row('night', '22:00', '06:00', true)]);
    const a = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-10-13T19:50:00Z') });
    const b = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-10-13T23:00:00Z') });
    expect(a?.expectedClockInAt.toISOString()).toBe('2026-10-13T20:00:00.000Z');
    expect(b?.expectedClockInAt.toISOString()).toBe('2026-10-13T20:00:00.000Z');
  });

  it('control: back at 12:55 (past the morning end + tolerance) is the afternoon shift', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([row('am', '08:00', '12:00'), row('pm', '13:00', '17:00')]);
    const res = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-10-13T10:55:00Z') });
    expect(res?.shiftId).toBe('pm');
  });
});
