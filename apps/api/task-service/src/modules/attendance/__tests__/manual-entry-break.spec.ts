import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalService } from '../approval.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

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
      breakMinutes: 30,
      ...over,
    });

  it('writes the rest as a real break row', async () => {
    await add();
    expect(breaks).toHaveLength(1);
    expect(breaks[0].durationMinutes).toBe(30);
    // The edit dialog lists rows; a number on the entry appears nowhere in it.
    expect(breaks[0].timeEntryId).toBeTruthy();
  });

  it('places it inside the shift, in the middle', async () => {
    /*
      Nobody knows when the rest was taken — it is being entered after the fact.
      A break at the start or the end reads as a late arrival or an early finish;
      the middle claims the least and can be dragged to the truth afterwards.
    */
    await add();
    const entry = created[0] as { clockInAt: Date; clockOutAt: Date };
    const br = breaks[0] as { startedAt: Date; endedAt: Date };
    expect(br.startedAt.getTime()).toBeGreaterThan(entry.clockInAt.getTime());
    expect(br.endedAt.getTime()).toBeLessThan(entry.clockOutAt.getTime());
    // Centred: the gap before equals the gap after.
    const before = br.startedAt.getTime() - entry.clockInAt.getTime();
    const after = entry.clockOutAt.getTime() - br.endedAt.getTime();
    expect(Math.abs(before - after)).toBeLessThan(1000);
  });

  it('records who entered it', async () => {
    // The same field the edit dialog stamps when an admin adds a break to
    // somebody else's shift — so the two paths read alike afterwards.
    await add();
    expect(breaks[0].addedById).toBe('admin-1');
  });

  it('costs nothing when there is no rest', async () => {
    // The common case must not pay for the uncommon one: no transaction, no
    // per-entry round trip, just the bulk insert that was always there.
    await add({ breakMinutes: 0 });
    expect(breaks).toHaveLength(0);
    expect(tx.timeEntry.createMany).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('gives every day of a back-fill its own rest', async () => {
    // A week of entries is a week of breaks — one number on one entry could
    // never have expressed that.
    await add({ startDate: '2026-09-01', endDate: '2026-09-03', weekdays: [1, 2, 3, 4, 5] });
    expect(breaks.length).toBe(created.length);
    expect(created.length).toBeGreaterThan(1);
  });
});
