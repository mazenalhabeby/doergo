/**
 * "Works here as" (clock review D1): a worker's own way of working at one workspace, and their own daily
 * hours — strictly one of the three presets or null, minutes clamped like the workspace's.
 */
import { AssignmentTermsService } from '../assignment-terms.service';
import { SpaceAnnouncer } from '../space-announcer.service';

function build() {
  const prisma: any = {
    spaceAssignment: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'a1',
        organizationId: 'org-1',
        userId: 'u1',
        spaceId: 'loc-1',
        user: { isExternal: false },
      }),
      update: jest.fn(async ({ data }: any) => ({ id: 'a1', spaceId: 'loc-1', space: {}, user: {}, ...data })),
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    companyLocation: { findUnique: jest.fn(async () => ({ timezone: 'Europe/Vienna' })) },
    timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
    rateHistory: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
  const terms = new AssignmentTermsService(prisma, new SpaceAnnouncer(prisma, { emit: jest.fn() } as any));
  const run = (body: Record<string, unknown>) =>
    terms.updateAssignment({ assignmentId: 'a1', organizationId: 'org-1', ...body } as any);
  return { prisma, run };
}

const saved = (prisma: any) => prisma.spaceAssignment.update.mock.calls[0][0].data;

describe('works here as (D1)', () => {
  it('saves a preset and the own hours', async () => {
    const { prisma, run } = build();
    await run({ workAs: 'IN_THE_FIELD', workDailyMinutes: 360 });
    expect(saved(prisma)).toMatchObject({ workAs: 'IN_THE_FIELD', workDailyMinutes: 360 });
  });

  it('null follows the workspace again', async () => {
    const { prisma, run } = build();
    await run({ workAs: null, workDailyMinutes: null });
    expect(saved(prisma)).toMatchObject({ workAs: null, workDailyMinutes: null });
  });

  it('an unknown way of working is refused and nothing is saved', async () => {
    const { prisma, run } = build();
    await expect(run({ workAs: 'NIGHT_OWL' })).rejects.toMatchObject({ response: { code: 'WORK_AS_INVALID' } });
    expect(prisma.spaceAssignment.update).not.toHaveBeenCalled();
  });

  it('hours outside the day are clamped like the workspace hours', async () => {
    const { prisma, run } = build();
    await run({ workDailyMinutes: 5000 });
    expect(saved(prisma).workDailyMinutes).toBeLessThanOrEqual(1440);
  });

  it('a PATCH without them leaves them alone', async () => {
    const { prisma, run } = build();
    await run({ autoClock: true });
    expect(saved(prisma)).not.toHaveProperty('workAs');
    expect(saved(prisma)).not.toHaveProperty('workDailyMinutes');
  });
});
