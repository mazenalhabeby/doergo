import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalService } from '../approval.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CountedTimeService } from '../counted-time.service';

/*
  A rest entered on "Add attendance" has to be the same thing as a rest entered
  on "Edit attendance". It was not.

  Add wrote `breakMinutes: 30` on the entry and created no break rows. Edit lists
  ROWS — so the rest was invisible the moment anybody opened the entry. And worse
  than invisible: adding any break in the edit dialog RECOMPUTES `breakMinutes`
  from the rows, so those thirty minutes were silently destroyed and the paid
  hours moved with them, with nothing on screen saying so.

  One representation: a break is a row, and `breakMinutes` is the sum of the
  rows, everywhere.
*/
describe('a rest entered with a manual attendance', () => {
  let service: ApprovalService;

  const created: Array<Record<string, unknown>> = [];
  const breaks: Array<Record<string, unknown>> = [];

  const tx = {
    timeEntry: {
      create: jest.fn(async ({ data }: any) => {
        created.push(data);
        return { id: `te-${created.length}`, clockInAt: data.clockInAt, clockOutAt: data.clockOutAt };
      }),
      createMany: jest.fn(async ({ data }: any) => { created.push(...data); return { count: data.length }; }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    break: { create: jest.fn(async ({ data }: any) => { breaks.push(data); return data; }) },
  };

  const prisma: Record<string, any> = {
    ...tx,
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', organizationId: 'org-1' }) },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'sp-1', lat: 1, lng: 2, timezone: 'Europe/Vienna' }) },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    created.length = 0;
    breaks.length = 0;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CountedTimeService,
        ApprovalService,
        { provide: PrismaService, useValue: prisma },
        // It announces the change to the notification service on success; that
        // is not what is under test here.
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(ApprovalService);
  });

  const add = (over: Record<string, unknown> = {}) =>
    (service as unknown as { addManualEntries: (d: unknown) => Promise<unknown> }).addManualEntries({
      userId: 'u1',
      organizationId: 'org-1',
      editorId: 'admin-1',
      locationId: 'sp-1',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      startTime: '08:00',
      endTime: '16:00',
      breakStart: '12:00',
      breakEnd: '12:30',
      breakType: 'LUNCH',
      breakReason: 'Lunch',
      ...over,
    });

  it('writes the rest as a real break row', async () => {
    await add();
    expect(breaks).toHaveLength(1);
    expect(breaks[0].durationMinutes).toBe(30);
    // The edit dialog lists rows; a number on the entry appears nowhere in it.
    expect(breaks[0].timeEntryId).toBeTruthy();
  });

  it('puts it where the office said, not where it guessed', async () => {
    // 08:00–16:00 with a break at 12:00 is four hours in, whatever the shift's
    // length — the point of asking for times instead of a number.
    await add();
    const entry = created[0] as { clockInAt: Date };
    const br = breaks[0] as { startedAt: Date; durationMinutes: number };
    expect(br.startedAt.getTime() - entry.clockInAt.getTime()).toBe(4 * 60 * 60_000);
    expect(br.durationMinutes).toBe(30);
  });

  it('refuses a break that falls outside the shift', async () => {
    await expect(add({ breakStart: '17:00', breakEnd: '17:30' })).rejects.toThrow(/inside the shift/);
    await expect(add({ breakStart: '07:00', breakEnd: '07:30' })).rejects.toThrow(/inside the shift/);
  });

  it('still accepts a plain number of minutes, and centres it', async () => {
    /*
      An older client — a phone that has not taken the update — sends only
      minutes. It must not start failing, and there is nowhere in that payload to
      say when the break was taken, so the middle is still the honest answer.
    */
    await add({ breakStart: undefined, breakEnd: undefined, breakMinutes: 30 });
    const entry = created[0] as { clockInAt: Date; clockOutAt: Date };
    const br = breaks[0] as { startedAt: Date; endedAt: Date };
    const before = br.startedAt.getTime() - entry.clockInAt.getTime();
    const after = entry.clockOutAt.getTime() - br.endedAt.getTime();
    expect(Math.abs(before - after)).toBeLessThan(1000);
  });

  it('records the type the office chose', async () => {
    await add();
    expect(breaks[0].type).toBe('LUNCH');
  });

  it('records who entered it', async () => {
    // The same field the edit dialog stamps when an admin adds a break to
    // somebody else's shift — so the two paths read alike afterwards.
    await add();
    expect(breaks[0].addedById).toBe('admin-1');
  });

  it('costs nothing when there is no break', async () => {
    // The common case must not pay for the uncommon one: no transaction, no
    // per-entry round trip, just the bulk insert that was always there.
    await add({ breakStart: undefined, breakEnd: undefined, breakMinutes: 0 });
    expect(breaks).toHaveLength(0);
    expect(tx.timeEntry.createMany).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a rest that does not fit in the shift', async () => {
    /*
      The break is placed INSIDE the shift, so one that does not fit would run
      past the clock-out. The edit dialog refuses exactly this when a human types
      it; entering it as a number must not be the way around that.

      Answered once for the whole back-fill, because the shift is the same length
      every day of it.
    */
    const noTimes = { breakStart: undefined, breakEnd: undefined };
    await expect(add({ ...noTimes, startTime: '08:00', endTime: '09:00', breakMinutes: 90 })).rejects.toThrow(/does not fit/);
    // Equal is refused too — a shift that is entirely rest is not a shift.
    await expect(add({ ...noTimes, startTime: '08:00', endTime: '09:00', breakMinutes: 60 })).rejects.toThrow(/does not fit/);
    // One minute short of the shift is allowed.
    await expect(add({ ...noTimes, startTime: '08:00', endTime: '09:00', breakMinutes: 59 })).resolves.toBeDefined();
  });

  it('measures an overnight shift the long way round', async () => {
    // 22:00 → 06:00 is eight hours, not minus sixteen — the same correction the
    // entry itself makes when the clock-out lands before the clock-in.
    // 22:00 → 06:00 with a break at 01:00 is three hours into the shift.
    await expect(add({ startTime: '22:00', endTime: '06:00', breakStart: '01:00', breakEnd: '01:45' })).resolves.toBeDefined();
  });

  it('gives every day of a back-fill its own rest', async () => {
    // A week of entries is a week of breaks — one number on one entry could
    // never have expressed that.
    await add({ startDate: '2026-09-01', endDate: '2026-09-03', weekdays: [1, 2, 3, 4, 5] });
    expect(breaks.length).toBe(created.length);
    expect(created.length).toBeGreaterThan(1);
  });
});
