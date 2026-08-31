import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { BreakService } from '../break.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Removing a break from a shift.
 *
 * Needed the moment breaks can be added by hand — a mistyped one would otherwise
 * be permanent — and it is also how an edit is performed, remove and re-add,
 * rather than a second endpoint repeating the same window and overlap checks.
 *
 * The two consequences are the same as adding, for the same reason: the shift's
 * break total is recomputed from what remains, and an approved entry returns to
 * PENDING because its paid hours changed.
 */
describe('deleteBreak', () => {
  let service: BreakService;

  const prisma: Record<string, any> = {
    break: { findFirst: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
    timeEntry: { update: jest.fn() },
    $transaction: jest.fn(),
  };

  const ORG = 'org-1';
  const EDITOR = 'admin-1';

  const existing = (over: Record<string, unknown> = {}) => ({
    id: 'brk-1',
    timeEntryId: 'entry-1',
    durationMinutes: 30,
    endedAt: new Date('2026-08-31T12:30:00Z'),
    timeEntry: { id: 'entry-1', approvalStatus: 'PENDING' },
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.break.findMany.mockResolvedValue([{ durationMinutes: 15 }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
        BreakService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(BreakService);
  });

  const call = () => service.deleteBreak({ breakId: 'brk-1', organizationId: ORG, editorId: EDITOR });

  it('removes it and recomputes the total from what remains', async () => {
    prisma.break.findFirst.mockResolvedValue(existing());

    const r: any = await call();
    expect(r.success).toBe(true);
    expect(prisma.break.delete).toHaveBeenCalledWith({ where: { id: 'brk-1' } });
    // 15, from the one break left — not 30 subtracted from a running total.
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ breakMinutes: 15 }) }),
    );
  });

  it('knocks an approved entry back to pending', async () => {
    prisma.break.findFirst.mockResolvedValue(existing({ timeEntry: { id: 'entry-1', approvalStatus: 'APPROVED' } }));
    await call();
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalStatus: 'PENDING', approvedById: null }) }),
    );
  });

  it('refuses a break that is still running', async () => {
    // An open break is the member's current state, not a record of the past —
    // ending it is a different action with a different endpoint.
    prisma.break.findFirst.mockResolvedValue(existing({ endedAt: null }));
    const r: any = await call();
    expect(r.statusCode).toBe(HttpStatus.CONFLICT);
    expect(prisma.break.delete).not.toHaveBeenCalled();
  });

  it('scopes the lookup through the entry to the organization', async () => {
    // A break id from another tenant must read as "not found", never as a delete.
    prisma.break.findFirst.mockResolvedValue(null);
    const r: any = await call();
    expect(r.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(prisma.break.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ timeEntry: { organizationId: ORG } }),
      }),
    );
  });

  it('deletes and recomputes in one transaction', async () => {
    // A delete that lands without its recompute leaves the shift claiming break
    // minutes that no row accounts for.
    prisma.break.findFirst.mockResolvedValue(existing());
    await call();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
