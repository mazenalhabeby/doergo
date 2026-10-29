import { Test } from '@nestjs/testing';
import { CountedTimeService } from '../core/counted-time.service';
import { PrismaService } from '@hbcfield/shared';
import { workedMinutes } from '@hbcfield/shared';

/**
 * The seam between the pure rule and the row.
 *
 * `counted-time.spec.ts` proves the arithmetic. This proves the part that can
 * still go wrong once it meets a database: which tolerance is used, what gets
 * written, what is deliberately NOT written, and whether every screen reads the
 * stored answer instead of quietly recomputing its own.
 */
describe('counted time, persisted', () => {
  let service: CountedTimeService;
  let prisma: any;

  const at = (hhmm: string) => new Date(`2026-09-06T${hhmm}:00.000Z`);

  beforeEach(async () => {
    prisma = {
      shift: { findUnique: jest.fn() },
      timeEntry: { update: jest.fn().mockResolvedValue({}) },
      break: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const mod = await Test.createTestingModule({
      providers: [CountedTimeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(CountedTimeService);
  });

  const entry = {
    id: 'e1',
    clockInAt: at('05:55'),
    clockOutAt: at('18:05'),
    expectedClockInAt: at('06:00'),
    expectedClockOutAt: at('18:00'),
    breakMinutes: 30,
    shiftId: 's1',
  };

  it('uses the SHIFT’s own tolerance, not a global one', async () => {
    prisma.shift.findUnique.mockResolvedValue({ flagToleranceMin: 25 });
    await service.columnsFor({ ...entry, clockInAt: at('06:20') }, at('18:00'));
    expect(prisma.shift.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' } }),
    );
  });

  it('does not ask the database twice when the caller already knows the tolerance', async () => {
    // The clock-out path looks it up for the flags anyway. Asking again would be
    // a second query on the hottest write in attendance.
    await service.columnsFor(entry, at('18:05'), 10);
    expect(prisma.shift.findUnique).not.toHaveBeenCalled();
  });

  it('clamps both ends and nets the break', async () => {
    const c = await service.columnsFor(entry, at('18:05'), 0);
    expect(c.countedStartAt).toEqual(at('06:00'));
    expect(c.countedEndAt).toEqual(at('18:00'));
    expect(c.paidMinutes).toBe(690); // 12h − 30m
  });

  it('a rest before the shift began is not taken off the counted time (rows, not the total)', async () => {
    // In 08:00, out 18:00, shift 09:00–17:00, rest 08:00–08:30: 480 counted, not 450.
    prisma.break.findMany.mockResolvedValue([{ startedAt: at('08:00'), endedAt: at('08:30'), isPaid: false }]);
    const row = { ...entry, clockInAt: at('08:00'), expectedClockInAt: at('09:00'), expectedClockOutAt: at('17:00') };
    const c = await service.columnsFor({ ...row, unpaidBreakMinutes: 30 }, at('18:00'), 5);
    expect(prisma.break.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { timeEntryId: 'e1' } }));
    expect(c.paidMinutes).toBe(480);
  });

  it('writes the recount from the row it is handed (only its rest rows are read)', async () => {
    await service.recomputeClosed({ ...entry, breakMinutes: 60 });
    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ paidMinutes: 660 }),
    });
  });

  it('leaves an OPEN entry alone — there is no paid figure until there is a clock-out', async () => {
    await service.recomputeClosed({ ...entry, clockOutAt: null });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  describe('what every screen reads', () => {
    it('prefers the stored figure over re-deriving it', () => {
      // The entry says 12h05m present, 30m break — but the counted answer is
      // 11h30m, because the early arrival was clamped off. A screen that did its
      // own arithmetic would print 11h35m and be wrong by five minutes forever.
      expect(workedMinutes({ paidMinutes: 690, totalMinutes: 725, breakMinutes: 30 })).toBe(690);
    });

    it('falls back to the old arithmetic for entries closed before the column existed', () => {
      expect(workedMinutes({ totalMinutes: 725, breakMinutes: 30 })).toBe(695);
    });

    it('never returns a negative number of hours', () => {
      expect(workedMinutes({ paidMinutes: -5 })).toBe(0);
      expect(workedMinutes({ totalMinutes: 10, breakMinutes: 60 })).toBe(0);
    });
  });
  // HBC USA, Oct 2026: a no-shift daily limit cut a 12 h 22 m night to 7 h 54 m. The limit is a
  // marker for the long-day flag, never a shift end: everything until the clock-out counts.
  it('counts past a no-shift daily limit to the clock-out', async () => {
    prisma.shift.findUnique.mockResolvedValue(null);
    const night = { clockInAt: at('00:00'), expectedClockOutAt: at('08:00'), breakMinutes: 0, shiftId: null };
    const capped = await service.columnsFor(night, at('12:00'));
    expect(capped.paidMinutes).toBe(480);
    const limit = await service.columnsFor({ ...night, endIsDailyLimit: true }, at('12:00'));
    expect(limit.paidMinutes).toBe(720);
    expect(limit.countedEndAt).toEqual(at('12:00'));
  });
});
