import { Test } from '@nestjs/testing';
import { WorkModel } from '@hbcfield/shared';
import { ShiftResolverService } from '../shift-resolver.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * "Late" on somebody who was early — when the WRONG shift instance is matched.
 *
 * The resolver walks the rota rows by priority and binds the FIRST one whose
 * instance has not ended (past its tolerance). With two shifts in a day it can
 * bind the one that is finishing, not the one the person came for, and the
 * clock-in is then judged against the earlier start.
 *
 * `it.failing`: these pin today's wrong answer; they turn red (and must become
 * plain `it`) when the matcher prefers the instance the clock-in belongs to.
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
  it.failing('split day 08:00–12:00 + 13:00–17:00: back at 12:05 for the afternoon is matched to the MORNING', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([row('am', '08:00', '12:00'), row('pm', '13:00', '17:00')]);
    const res = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-10-13T10:05:00Z') });
    // Today: shift "am", expected start 08:00 → the entry is flagged LATE_ARRIVAL (245 min).
    expect(res?.shiftId).toBe('pm');
  });

  it.failing('night 22:00–06:00 + day 07:00–15:00: arriving at 06:05 for the day shift is matched to last NIGHT', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([row('night', '22:00', '06:00', true), row('day', '07:00', '15:00')]);
    const res = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-10-13T04:05:00Z') });
    // Today: shift "night" (started yesterday 22:00) → LATE_ARRIVAL by ~8 h.
    expect(res?.shiftId).toBe('day');
  });

  it('control: back at 12:55 (past the morning end + tolerance) is the afternoon shift', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([row('am', '08:00', '12:00'), row('pm', '13:00', '17:00')]);
    const res = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-10-13T10:55:00Z') });
    expect(res?.shiftId).toBe('pm');
  });
});
