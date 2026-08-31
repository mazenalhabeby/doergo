import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { BreakService } from '../break.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Adding a break to somebody else's shift.
 *
 * Breaks are self-service and stay that way — the member starts and ends their
 * own. This is the correction path for when that did not happen: a dead phone, a
 * shift reconstructed after the fact.
 *
 * Which makes the validation the feature. Anyone can insert a row; what stops
 * this being a way to quietly rewrite somebody's paid hours is that the break has
 * to fit the shift, cannot overlap another, must carry a reason, records who
 * entered it, and knocks the entry back out of approval because the hours it was
 * approved for have changed.
 */
describe('addBreakForMember', () => {
  let service: BreakService;

  const prisma: Record<string, any> = {
    timeEntry: { findFirst: jest.fn(), update: jest.fn() },
    break: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const ORG = 'org-1';
  const EDITOR = 'admin-1';
  const ENTRY = 'entry-1';

  // A shift from 09:00 to 17:00.
  const shift = (over: Record<string, unknown> = {}) => ({
    id: ENTRY,
    userId: 'member-1',
    organizationId: ORG,
    clockInAt: new Date('2026-08-31T09:00:00Z'),
    clockOutAt: new Date('2026-08-31T17:00:00Z'),
    approvalStatus: 'PENDING',
    breaks: [],
    ...over,
  });

  const call = (over: Record<string, unknown> = {}) =>
    service.addBreakForMember({
      timeEntryId: ENTRY,
      organizationId: ORG,
      editorId: EDITOR,
      startedAt: '2026-08-31T12:00:00Z',
      endedAt: '2026-08-31T12:30:00Z',
      reason: 'Phone battery died before lunch',
      ...over,
    } as any);

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: any) =>
      typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
    );
    prisma.break.create.mockImplementation(({ data }: any) => ({ id: 'brk-1', ...data }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
        BreakService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(BreakService);
  });

  it('adds a break inside the shift and records who entered it', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue(shift());

    const r: any = await call();
    expect(r.success).toBe(true);
    expect(prisma.break.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ addedById: EDITOR, durationMinutes: 30 }),
      }),
    );
  });

  it('refuses without a reason', async () => {
    // Not decoration: this changes paid hours on somebody else's timesheet.
    prisma.timeEntry.findFirst.mockResolvedValue(shift());
    const r: any = await call({ reason: '   ' });
    expect(r.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(prisma.break.create).not.toHaveBeenCalled();
  });

  it('refuses a break that starts before the shift', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue(shift());
    const r: any = await call({ startedAt: '2026-08-31T08:00:00Z', endedAt: '2026-08-31T08:30:00Z' });
    expect(r.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('refuses a break that ends after the shift', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue(shift());
    const r: any = await call({ startedAt: '2026-08-31T16:45:00Z', endedAt: '2026-08-31T17:30:00Z' });
    expect(r.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('allows a break past "now" on a shift still open', async () => {
    // An open shift has no end to be inside of, so only the start is checked.
    prisma.timeEntry.findFirst.mockResolvedValue(shift({ clockOutAt: null }));
    const r: any = await call();
    expect(r.success).toBe(true);
  });

  it('refuses an end at or before the start', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue(shift());
    const r: any = await call({ startedAt: '2026-08-31T12:00:00Z', endedAt: '2026-08-31T12:00:00Z' });
    expect(r.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('refuses a break overlapping one already recorded', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue(
      shift({
        breaks: [
          {
            id: 'brk-0',
            startedAt: new Date('2026-08-31T12:15:00Z'),
            endedAt: new Date('2026-08-31T12:45:00Z'),
            durationMinutes: 30,
          },
        ],
      }),
    );
    const r: any = await call();
    expect(r.statusCode).toBe(HttpStatus.CONFLICT);
    expect(prisma.break.create).not.toHaveBeenCalled();
  });

  it('allows a break that merely touches another end-to-end', async () => {
    // 12:00–12:30 then 12:30–13:00 is two breaks, not an overlap.
    prisma.timeEntry.findFirst.mockResolvedValue(
      shift({
        breaks: [
          {
            id: 'brk-0',
            startedAt: new Date('2026-08-31T11:30:00Z'),
            endedAt: new Date('2026-08-31T12:00:00Z'),
            durationMinutes: 30,
          },
        ],
      }),
    );
    const r: any = await call();
    expect(r.success).toBe(true);
  });

  it('recomputes the entry total from the rows rather than incrementing', async () => {
    /*
      A running total that is added to drifts the moment anything is edited or
      deleted — which is exactly what this feature makes possible.
    */
    prisma.timeEntry.findFirst.mockResolvedValue(
      shift({
        breaks: [
          {
            id: 'brk-0',
            startedAt: new Date('2026-08-31T10:00:00Z'),
            endedAt: new Date('2026-08-31T10:15:00Z'),
            durationMinutes: 15,
          },
        ],
      }),
    );
    await call();
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ breakMinutes: 45 }) }),
    );
  });

  it('knocks an approved entry back to pending', async () => {
    // The hours it was approved for just changed, so the approval no longer
    // describes what is being approved.
    prisma.timeEntry.findFirst.mockResolvedValue(shift({ approvalStatus: 'APPROVED' }));
    await call();
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvalStatus: 'PENDING', approvedById: null }),
      }),
    );
  });

  it('leaves a pending entry pending', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue(shift());
    await call();
    const data = prisma.timeEntry.update.mock.calls[0][0].data;
    expect(data.approvalStatus).toBeUndefined();
  });

  it('scopes the entry to the caller organization', async () => {
    // An entry id from another tenant must read as "not found", never as an edit.
    prisma.timeEntry.findFirst.mockResolvedValue(null);
    const r: any = await call();
    expect(r.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }),
    );
  });
});
