/**
 * The jobs a person is working on: newest first, and one job asked about by its id.
 *
 * ⚠️ A person can sit on more than 50 unfinished jobs. Read unordered, the job they are on NOW
 * fell outside the 50 — the clock-out paused nothing and the last one out of a crew left it running.
 */
import { workingJobsOf } from '../handover/working-jobs';

function deps(rows: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  return {
    findMany,
    deps: {
      prisma: { task: { findMany }, companyLocation: { findMany: jest.fn().mockResolvedValue([]) } },
      workflows: { getWorkflow: jest.fn().mockResolvedValue(null) },
    } as never,
  };
}

describe('workingJobsOf', () => {
  it('reads the most recently touched jobs first', async () => {
    const { deps: d, findMany } = deps([]);
    await workingJobsOf(d, 'u', 'org');
    expect(findMany.mock.calls[0][0]).toMatchObject({ orderBy: { updatedAt: 'desc' }, take: 50 });
  });

  it('asks about one job by its id when given one', async () => {
    const { deps: d, findMany } = deps([]);
    await workingJobsOf(d, 'u', 'org', { taskId: 't1' });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ id: 't1', organizationId: 'org' });
  });
});
