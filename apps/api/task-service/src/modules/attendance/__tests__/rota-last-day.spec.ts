import { Test } from '@nestjs/testing';
import { WorkModel, PrismaService } from '@hbcfield/shared';
import { ShiftResolverService } from '../core/shift-resolver.service';
import { rotaDay } from '../../shifts/shifts-helpers';

/**
 * A rota's LAST day: effectiveTo is stored as midnight UTC of that day (rota.service), so asking
 * "not ended before the clock-in INSTANT" missed every clock-in on it. 08:00 Vienna on
 * 3 Nov 2026 is 07:00Z — after 2026-11-03T00:00Z — and found no shift.
 */
describe('a rota on its last day still holds the clock-in', () => {
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

  const row = (effectiveFrom: string, effectiveTo: string | null) => ({
    id: 'sa-1',
    userId: 'u-1',
    spaceId: 'sp-1',
    shiftId: 's-1',
    recurrence: 'DAILY',
    daysOfWeek: [],
    daysOfMonth: [],
    dates: [],
    effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`),
    effectiveTo: effectiveTo ? new Date(`${effectiveTo}T00:00:00Z`) : null,
    priority: 0,
    isActive: true,
    shift: { id: 's-1', startLocal: '08:00', endLocal: '16:00', crossesMidnight: false, isActive: true },
  });
  const space = { id: 'sp-1', timezone: 'Europe/Vienna', workModel: WorkModel.SHIFT, lat: 47.98, lng: 13.83 };

  it('asks by local day, and binds 08:00 Vienna on the last day', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([row('2026-10-01', '2026-11-03')]);
    const res = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-11-03T07:00:00Z') });
    expect(res?.shiftId).toBe('s-1');
    const where = prisma.shiftAssignment.findMany.mock.calls[0][0].where;
    expect(where.effectiveFrom).toEqual({ lt: new Date('2026-11-04T00:00:00.000Z') });
    expect(where.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gte: new Date('2026-11-02T00:00:00.000Z') } }]);
  });

  it('the day after the last day is not held by it', async () => {
    prisma.shiftAssignment.findMany.mockResolvedValue([row('2026-10-01', '2026-11-03')]);
    const res = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-11-04T07:00:00Z') });
    expect(res).toBeNull();
  });

  it('00:30 Vienna on the FIRST day (still the day before in UTC) is held', async () => {
    const night = row('2026-11-03', null);
    night.shift = { ...night.shift, startLocal: '00:00', endLocal: '06:00' };
    prisma.shiftAssignment.findMany.mockResolvedValue([night]);
    const res = await resolver.resolveForClockIn({ userId: 'u-1', space, clockInAt: new Date('2026-11-02T23:30:00Z') });
    expect(res?.shiftId).toBe('s-1');
  });
});

describe('rotaDay — a rota bound is the day it names', () => {
  it('drops the time a client sent', () => {
    expect(rotaDay('2026-11-03')).toEqual(new Date('2026-11-03T00:00:00.000Z'));
    expect(rotaDay('2026-11-03T23:59:59+01:00')).toEqual(new Date('2026-11-03T00:00:00.000Z'));
  });
});
