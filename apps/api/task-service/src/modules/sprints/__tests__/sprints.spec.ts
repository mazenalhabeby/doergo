import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SprintsService } from '../sprints.service';
import { SprintReportsService } from '../sprint-reports.service';

/**
 * A sprint's life: PLANNING → ACTIVE → COMPLETED, one ACTIVE per organization,
 * the end after the start, a delete that unlinks tasks and never runs on the
 * active one — and the report written at completion, whose burndown days are
 * the WORKSPACE's days, not the server's.
 */
const ORG = 'org-1';
const sprintRow = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Sprint 1',
  organizationId: ORG,
  spaceId: null,
  status: 'PLANNING',
  startDate: new Date('2026-10-05T00:00:00Z'),
  endDate: new Date('2026-10-19T00:00:00Z'),
  ...over,
});

function setup() {
  const prisma: any = {
    sprint: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 's1', ...data })),
      delete: jest.fn(),
    },
    sprintReport: { findMany: jest.fn().mockResolvedValue([]) },
    task: { updateMany: jest.fn() },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'space-1', timezone: 'Europe/Vienna' }) },
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/New_York' }) },
    $transaction: jest.fn(),
  };
  const reports = new SprintReportsService(prisma);
  const sprints = new SprintsService(prisma);
  (sprints as any).sprintReports = reports;
  return { prisma, sprints, reports };
}

describe('sprints — creating and editing', () => {
  it('the end must come after the start', async () => {
    const { prisma, sprints } = setup();
    const same = { name: 'S', organizationId: ORG, startDate: '2026-10-05', endDate: '2026-10-05' };
    await expect(sprints.create(same)).rejects.toThrow(BadRequestException);
    expect(prisma.sprint.create).not.toHaveBeenCalled();
  });

  it('goes after the last sprint, organization-wide unless a space is named', async () => {
    const { prisma, sprints } = setup();
    prisma.sprint.findFirst.mockResolvedValueOnce({ position: 2 });
    await sprints.create({ name: 'S', organizationId: ORG, startDate: '2026-10-05', endDate: '2026-10-19' });
    expect(prisma.sprint.create.mock.calls[0][0].data).toMatchObject({ position: 3, spaceId: null });
  });

  it('an update checks the end against the stored start when only the end is sent', async () => {
    const { prisma, sprints } = setup();
    prisma.sprint.findUnique.mockResolvedValue(sprintRow());
    await expect(sprints.update({ id: 's1', organizationId: ORG, endDate: '2026-10-01' })).rejects.toThrow(
      BadRequestException,
    );
    await sprints.update({ id: 's1', organizationId: ORG, goal: 'Ship it' });
    expect(prisma.sprint.update.mock.calls[0][0].data).toEqual({ goal: 'Ship it' });
  });

  it("another organization's sprint answers 404", async () => {
    const { prisma, sprints } = setup();
    prisma.sprint.findUnique.mockResolvedValue(sprintRow({ organizationId: 'org-2' }));
    await expect(sprints.findOne({ id: 's1', organizationId: ORG })).rejects.toThrow(NotFoundException);
    await expect(sprints.update({ id: 's1', organizationId: ORG, name: 'x' })).rejects.toThrow(NotFoundException);
    expect(prisma.sprint.update).not.toHaveBeenCalled();
  });

  it('a space sees its own sprints and the organization-wide ones', async () => {
    const { prisma, sprints } = setup();
    await sprints.findAll({ organizationId: ORG, spaceId: 'space-1', status: 'ACTIVE' });
    expect(prisma.sprint.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      OR: [{ spaceId: 'space-1' }, { spaceId: null }],
      status: 'ACTIVE',
    });
  });
});

describe('sprints — the life of one', () => {
  it('only a PLANNING sprint starts', async () => {
    const { prisma, sprints } = setup();
    prisma.sprint.findUnique.mockResolvedValue(sprintRow({ status: 'COMPLETED' }));
    await expect(sprints.start({ id: 's1', organizationId: ORG })).rejects.toThrow('Only sprints in PLANNING');
  });

  it('one ACTIVE sprint per organization, named in the refusal', async () => {
    const { prisma, sprints } = setup();
    prisma.sprint.findUnique.mockResolvedValue(sprintRow());
    prisma.sprint.findFirst.mockResolvedValueOnce({ id: 's0', name: 'Sprint 0' });
    await expect(sprints.start({ id: 's1', organizationId: ORG })).rejects.toThrow(
      'Sprint "Sprint 0" is already active',
    );
    expect(prisma.sprint.findFirst.mock.calls[0][0].where).toEqual({ organizationId: ORG, status: 'ACTIVE' });
    expect(prisma.sprint.update).not.toHaveBeenCalled();

    await sprints.start({ id: 's1', organizationId: ORG });
    expect(prisma.sprint.update.mock.calls[0][0].data).toEqual({ status: 'ACTIVE' });
  });

  it('only an ACTIVE sprint completes', async () => {
    const { prisma, sprints } = setup();
    prisma.sprint.findUnique.mockResolvedValue(sprintRow());
    await expect(sprints.complete({ id: 's1', organizationId: ORG })).rejects.toThrow('Only ACTIVE sprints');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("completing writes the report in the WORKSPACE's zone, in the same transaction", async () => {
    const { prisma, sprints, reports } = setup();
    prisma.sprint.findUnique.mockResolvedValue(sprintRow({ status: 'ACTIVE', spaceId: 'space-1' }));
    const tx: any = { sprint: { update: jest.fn(async () => ({ id: 's1', tasks: [] })) } };
    prisma.$transaction.mockImplementation((fn: any) => fn(tx));
    const generate = jest.spyOn(reports, 'generateSprintReport').mockResolvedValue({ id: 'r1' } as any);

    const res: any = await sprints.complete({ id: 's1', organizationId: ORG });
    expect(tx.sprint.update.mock.calls[0][0].data).toEqual({ status: 'COMPLETED' });
    expect(generate.mock.calls[0][0]).toBe(tx);
    expect(generate.mock.calls[0][2]).toMatchObject({ timezone: 'Europe/Vienna' });
    expect(res.data).toMatchObject({ report: { id: 'r1' }, tasks: undefined });
  });

  it('an active sprint is never deleted; another one unlinks its tasks first', async () => {
    const { prisma, sprints } = setup();
    prisma.sprint.findUnique.mockResolvedValueOnce(sprintRow({ status: 'ACTIVE' }));
    await expect(sprints.remove({ id: 's1', organizationId: ORG })).rejects.toThrow('Cannot delete an active sprint');
    expect(prisma.task.updateMany).not.toHaveBeenCalled();

    prisma.sprint.findUnique.mockResolvedValueOnce(sprintRow({ status: 'COMPLETED' }));
    await sprints.remove({ id: 's1', organizationId: ORG });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { sprintId: 's1' }, data: { sprintId: null } });
    expect(prisma.sprint.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });
});

describe('the sprint report', () => {
  const VIENNA = 'Europe/Vienna';
  const start = new Date('2026-10-04T22:00:00Z'); // 5 Oct, 00:00 in Vienna
  const end = new Date('2026-10-07T21:59:00Z'); // 7 Oct, 23:59 in Vienna

  function tx(events: unknown[] = []) {
    return {
      taskEvent: { findMany: jest.fn().mockResolvedValue(events) },
      sprintReport: { create: jest.fn(async ({ data }: any) => data) },
    };
  }

  it('counts committed, completed, carried over and added — a canceled task is neither done nor carried', async () => {
    const { reports } = setup();
    const t = tx();
    const tasks = [
      { id: 'a', status: 'COMPLETED', storyPoints: 3, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'b', status: 'CLOSED', storyPoints: 2, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'c', status: 'CANCELED', storyPoints: 5, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'd', status: 'IN_PROGRESS', storyPoints: null, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'e', status: 'NEW', storyPoints: 1, createdAt: '2026-10-06T09:00:00Z' },
    ];
    const report: any = await reports.generateSprintReport(
      t as any,
      { tasks },
      {
        id: 's1',
        organizationId: ORG,
        startDate: start,
        endDate: end,
        timezone: VIENNA,
      },
    );
    expect(report).toMatchObject({
      committedTasks: 5,
      committedPoints: 11,
      completedTasks: 2,
      completedPoints: 5,
      carriedOverTasks: 2,
      carriedOverPoints: 1,
      addedMidSprint: 1,
      velocity: 5,
    });
  });

  it("the burndown walks the workspace's days: 00:30 in Vienna is the next day, not the one before", async () => {
    const { reports } = setup();
    const t = tx([
      // 5 Oct 22:30 UTC = 6 Oct 00:30 in Vienna.
      { taskId: 'a', metadata: { newStatus: 'COMPLETED' }, createdAt: new Date('2026-10-05T22:30:00Z') },
    ]);
    const tasks = [
      { id: 'a', status: 'COMPLETED', storyPoints: 3, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'b', status: 'NEW', storyPoints: 2, createdAt: '2026-10-01T00:00:00Z' },
    ];
    const report: any = await reports.generateSprintReport(
      t as any,
      { tasks },
      {
        id: 's1',
        organizationId: ORG,
        startDate: start,
        endDate: end,
        timezone: VIENNA,
      },
    );
    expect(report.dailyBurndown).toEqual([
      { date: '2026-10-05', remaining: 5, ideal: 3.33 },
      { date: '2026-10-06', remaining: 2, ideal: 1.67 },
      { date: '2026-10-07', remaining: 2, ideal: 0 },
    ]);
  });

  it('a task moved back out of done counts as remaining again', async () => {
    const { reports } = setup();
    const t = tx([
      { taskId: 'a', metadata: { newStatus: 'COMPLETED' }, createdAt: new Date('2026-10-05T08:00:00Z') },
      { taskId: 'a', metadata: { newStatus: 'IN_PROGRESS' }, createdAt: new Date('2026-10-06T08:00:00Z') },
    ]);
    const tasks = [{ id: 'a', status: 'IN_PROGRESS', storyPoints: 4, createdAt: '2026-10-01T00:00:00Z' }];
    const report: any = await reports.generateSprintReport(
      t as any,
      { tasks },
      {
        id: 's1',
        organizationId: ORG,
        startDate: start,
        endDate: end,
        timezone: VIENNA,
      },
    );
    expect(report.dailyBurndown.map((d: any) => d.remaining)).toEqual([0, 4, 4]);
  });

  it('a sprint with no tasks asks no event query', async () => {
    const { reports } = setup();
    const t = tx();
    await reports.generateSprintReport(
      t as any,
      { tasks: [] },
      {
        id: 's1',
        organizationId: ORG,
        startDate: start,
        endDate: end,
        timezone: VIENNA,
      },
    );
    expect(t.taskEvent.findMany).not.toHaveBeenCalled();
  });

  it('reading a report: missing until the sprint completes, 404 for another organization', async () => {
    const { prisma, reports } = setup();
    prisma.sprint.findUnique.mockResolvedValueOnce({ ...sprintRow(), report: null });
    await expect(reports.getReport({ id: 's1', organizationId: ORG })).rejects.toThrow(
      'generated when a sprint is completed',
    );
    prisma.sprint.findUnique.mockResolvedValueOnce({ ...sprintRow({ organizationId: 'org-2' }), report: { id: 'r' } });
    await expect(reports.getReport({ id: 's1', organizationId: ORG })).rejects.toThrow(NotFoundException);
  });

  it('velocity: the last sprints, oldest first for the chart, bounded', async () => {
    const { prisma, reports } = setup();
    prisma.sprintReport.findMany.mockResolvedValue([
      { sprint: { name: 'S3' }, committedPoints: 8, completedPoints: 6, velocity: 6 },
      { sprint: { name: 'S2' }, committedPoints: 5, completedPoints: 5, velocity: 5 },
    ]);
    const res: any = await reports.getVelocity({ organizationId: ORG, limit: 10_000 });
    expect(res.data.map((r: any) => r.sprintName)).toEqual(['S2', 'S3']);
    expect(prisma.sprintReport.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(200);
  });
});
