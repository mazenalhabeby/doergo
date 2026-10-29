import { WorkModel, PrismaService } from '@hbcfield/shared';
import { ShiftResolverService } from '../core/shift-resolver.service';

/**
 * A split day — 08:00–12:00 and 13:00–17:00, two rota rows — is two planned windows. One row per
 * day (`rotaFor`) hid the afternoon from the automatic clock, the next-shift line and the
 * pre-check's planned minutes, while the clock-in itself held people to both.
 */
describe('plannedWindows — every rota row that plans the day', () => {
  const row = (id: string, startLocal: string, endLocal: string, priority = 0) => ({
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
    priority,
    isActive: true,
    shift: { id, startLocal, endLocal, crossesMidnight: false, isActive: true },
  });
  const space = { id: 'sp-1', timezone: 'Europe/Vienna', workModel: WorkModel.SHIFT, lat: 47.98, lng: 13.83 };

  it('returns both halves, in time order, with the same two queries', async () => {
    const prisma = {
      shiftAssignment: { findMany: jest.fn().mockResolvedValue([row('pm', '13:00', '17:00', 5), row('am', '08:00', '12:00')]) },
      technicianSchedule: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const resolver = new ShiftResolverService(prisma as unknown as PrismaService);
    const out = await resolver.plannedWindows('u-1', [space], () => ['2026-10-13']);
    const list = out.get('sp-1')!;
    expect(list.map((w) => [w.shiftId, w.expectedClockInAt.toISOString(), w.expectedClockOutAt.toISOString()])).toEqual([
      ['am', '2026-10-13T06:00:00.000Z', '2026-10-13T10:00:00.000Z'],
      ['pm', '2026-10-13T11:00:00.000Z', '2026-10-13T15:00:00.000Z'],
    ]);
    expect(prisma.shiftAssignment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.technicianSchedule.findMany).toHaveBeenCalledTimes(1);
  });

  it('a day the rota is silent on falls back to the weekly schedule', async () => {
    const prisma = {
      shiftAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      technicianSchedule: { findMany: jest.fn().mockResolvedValue([{ dayOfWeek: 2, startTime: '09:00', endTime: '17:00' }]) },
    };
    const out = await new ShiftResolverService(prisma as unknown as PrismaService).plannedWindows('u-1', [space], () => [
      '2026-10-13',
    ]);
    expect(out.get('sp-1')!.map((w) => w.shiftId)).toEqual([null]);
  });
});
