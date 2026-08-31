import { Test, TestingModule } from '@nestjs/testing';
import { BreakService } from '../break.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The shape of "the breaks on this shift".
 *
 * The dialog listing them read the response as an array and defaulted to `[]`
 * when it was not one. The endpoint answers an OBJECT — `{ breaks, totalBreakMinutes,
 * breakCount }` — so the list was always empty: a shift with breaks looked like a
 * shift with none, and a break just saved could not be seen on reopening.
 *
 * The defensive `Array.isArray(...) ? ... : []` is what made it silent. A
 * fallback that hides a shape mismatch is worse than the crash it prevents,
 * because nothing ever says the guess was wrong — so the shape is pinned here.
 */
describe('getBreaksForEntry — response shape', () => {
  let service: BreakService;

  const prisma: Record<string, any> = {
    timeEntry: { findFirst: jest.fn() },
    break: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
        BreakService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(BreakService);
  });

  const rows = [
    { id: 'b1', type: 'LUNCH', durationMinutes: 60, startedAt: new Date(), endedAt: new Date(), addedBy: null },
    { id: 'b2', type: 'SHORT', durationMinutes: 15, startedAt: new Date(), endedAt: new Date(), addedBy: { id: 'u1', firstName: 'A', lastName: 'B' } },
  ];

  it('returns the breaks under data.breaks, not as a bare array', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1' });
    prisma.break.findMany.mockResolvedValue(rows);

    const result: any = await service.getBreaksForEntry({ timeEntryId: 'e1', organizationId: 'org-1' });

    // The exact path the client reads. If this moves, the client silently shows
    // an empty list again.
    expect(Array.isArray(result.data.breaks)).toBe(true);
    expect(result.data.breaks).toHaveLength(2);
    expect(Array.isArray(result.data)).toBe(false);
  });

  it('totals the breaks for the header', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1' });
    prisma.break.findMany.mockResolvedValue(rows);

    const result: any = await service.getBreaksForEntry({ timeEntryId: 'e1', organizationId: 'org-1' });
    expect(result.data.totalBreakMinutes).toBe(75);
    expect(result.data.breakCount).toBe(2);
  });

  it('carries who added each break', async () => {
    // Without this the dialog cannot tell a manually-added break from one the
    // member took — which is the whole reason the column exists.
    prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1' });
    prisma.break.findMany.mockResolvedValue(rows);

    await service.getBreaksForEntry({ timeEntryId: 'e1', organizationId: 'org-1' });
    expect(prisma.break.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ addedBy: expect.anything() }) }),
    );
  });
});
