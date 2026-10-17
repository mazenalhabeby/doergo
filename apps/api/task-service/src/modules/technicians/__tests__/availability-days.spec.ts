import { BadRequestException } from '@nestjs/common';
import { availabilityDays } from '../technicians-helpers';
import { MemberScheduleService } from '../member-schedule.service';

/**
 * Availability for a date RANGE answers every calendar day exactly once, whatever zone the
 * server runs in.
 *
 * The range used to be walked as a JS Date: `new Date('2026-10-13')` (UTC midnight) stepped
 * with `setDate(+1)` in the server's LOCAL zone. Across a DST change that step is 23 or 25
 * hours, so in Vienna 13→26 Oct ended on the 25th (the 26th landed at 01:00 UTC, past the end),
 * and west of UTC the same instant is the previous evening, so `getDay()` named the wrong
 * weekday. Days are date keys now — they have no zone.
 */
describe('availability days', () => {
  const ORIGINAL_TZ = process.env.TZ;
  afterAll(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  const ZONES = ['Europe/Vienna', 'America/Chicago', 'UTC', 'Asia/Tokyo'];

  const expectContiguous = (days: string[], from: string, to: string) => {
    expect(days[0]).toBe(from);
    expect(days[days.length - 1]).toBe(to);
    expect(new Set(days).size).toBe(days.length);
    for (let i = 1; i < days.length; i++) {
      const prev = Date.parse(`${days[i - 1]}T00:00:00Z`);
      expect(Date.parse(`${days[i]}T00:00:00Z`) - prev).toBe(86_400_000);
    }
  };

  describe.each(ZONES)('server in %s', (tz) => {
    beforeEach(() => {
      process.env.TZ = tz;
    });

    it('October DST change (EU 25 Oct, US 1 Nov): 13→26 Oct is 14 days, the 26th included', () => {
      const days = availabilityDays({ startDate: '2026-10-13', endDate: '2026-10-26' });
      expect(days).toHaveLength(14);
      expectContiguous(days, '2026-10-13', '2026-10-26');
    });

    it('US autumn change: 28 Oct → 4 Nov keeps 4 Nov', () => {
      const days = availabilityDays({ startDate: '2026-10-28', endDate: '2026-11-04' });
      expect(days).toHaveLength(8);
      expectContiguous(days, '2026-10-28', '2026-11-04');
    });

    it('March DST change (US 8 Mar, EU 29 Mar): 1 → 31 Mar is 31 days', () => {
      const days = availabilityDays({ startDate: '2027-03-01', endDate: '2027-03-31' });
      expect(days).toHaveLength(31);
      expectContiguous(days, '2027-03-01', '2027-03-31');
    });

    it('a normal week is seven days', () => {
      const days = availabilityDays({ startDate: '2026-06-01', endDate: '2026-06-07' });
      expect(days).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']);
    });

    it('a one-day range is that day', () => {
      expect(availabilityDays({ startDate: '2026-10-25', endDate: '2026-10-25' })).toEqual(['2026-10-25']);
    });

    it('a single date is that date; none is today (UTC date, as before)', () => {
      expect(availabilityDays({ date: '2026-03-29' })).toEqual(['2026-03-29']);
      expect(availabilityDays({}, new Date('2026-10-25T23:30:00Z'))).toEqual(['2026-10-25']);
    });
  });

  it('the span cap is unchanged: 92 days apart is allowed, 93 is refused', () => {
    expect(availabilityDays({ startDate: '2026-01-01', endDate: '2026-04-03' })).toHaveLength(93);
    expect(() => availabilityDays({ startDate: '2026-01-01', endDate: '2026-04-04' })).toThrow(BadRequestException);
  });

  it('an inverted range answers nothing', () => {
    expect(availabilityDays({ startDate: '2026-10-26', endDate: '2026-10-13' })).toEqual([]);
  });

  describe.each(['Europe/Vienna', 'America/Chicago'])('getAvailability, server in %s', (tz) => {
    beforeEach(() => {
      process.env.TZ = tz;
    });

    const tech = {
      id: 't1',
      firstName: 'Mike',
      lastName: 'Weber',
      position: null,
      // Monday only.
      schedules: [{ dayOfWeek: 1, startTime: '08:00', endTime: '16:00', notes: null }],
      // @db.Date values come back as UTC midnight.
      timeOffRequests: [{ startDate: new Date('2026-10-26T00:00:00Z'), endDate: new Date('2026-10-26T00:00:00Z'), reason: 'x' }],
      spaceAssignments: [],
    };

    const service = () => {
      const prisma = { user: { findMany: jest.fn().mockResolvedValue([tech]) } };
      return {
        prisma,
        svc: new MemberScheduleService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any),
      };
    };

    it('answers 13→26 Oct once per day, with the right weekday and the leave on the 26th', async () => {
      const { prisma, svc } = service();
      const res: any = await svc.getAvailability({ organizationId: 'o', startDate: '2026-10-13', endDate: '2026-10-26' });
      const rows = res.data as any[];
      expect(rows.map((r) => r.date)).toEqual([
        '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19',
        '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26',
      ]);
      expect(rows[0]).toMatchObject({ dayOfWeek: 2, dayName: 'Tuesday' });
      const monday19 = rows.find((r) => r.date === '2026-10-19');
      expect(monday19).toMatchObject({ dayOfWeek: 1, dayName: 'Monday' });
      expect(monday19.technicians[0]).toMatchObject({ isAvailable: true, onTimeOff: false });
      const monday26 = rows.find((r) => r.date === '2026-10-26');
      expect(monday26).toMatchObject({ dayOfWeek: 1, dayName: 'Monday' });
      expect(monday26.technicians[0]).toMatchObject({ isAvailable: false, onTimeOff: true });

      // Time off is asked for the whole range, as @db.Date instants.
      const where = prisma.user.findMany.mock.calls[0][0].select.timeOffRequests.where;
      expect(where.startDate.lte.toISOString()).toBe('2026-10-26T00:00:00.000Z');
      expect(where.endDate.gte.toISOString()).toBe('2026-10-13T00:00:00.000Z');
    });

    it('a single date still returns one object', async () => {
      const { svc } = service();
      const res: any = await svc.getAvailability({ organizationId: 'o', date: '2026-10-26' });
      expect(res.data).toMatchObject({ date: '2026-10-26', dayOfWeek: 1, dayName: 'Monday' });
    });
  });
});

describe('availability is scoped to the reader\'s workspaces', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MemberScheduleService } = require('../member-schedule.service');
  const run = async (scopeSpaceIds?: string[]) => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = Object.create(MemberScheduleService.prototype);
    svc.prisma = { user: { findMany }, timeOff: { findMany: jest.fn().mockResolvedValue([]) }, task: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) } };
    await svc.getAvailability({ organizationId: 'o1', date: '2026-10-13', scopeSpaceIds }).catch(() => undefined);
    return findMany.mock.calls[0]?.[0]?.where;
  };
  it('org-wide readers see everybody', async () => {
    expect((await run(undefined))?.spaceAssignments).toBeUndefined();
  });
  it('a reader allowed in some workspaces sees only their people', async () => {
    expect((await run(['s1']))?.spaceAssignments?.some?.spaceId).toEqual({ in: ['s1'] });
  });
  it('a reader allowed nowhere sees nobody', async () => {
    expect((await run([]))?.spaceAssignments?.some?.spaceId).toEqual({ in: [] });
  });
});
