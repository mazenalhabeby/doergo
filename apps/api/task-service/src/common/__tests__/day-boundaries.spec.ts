import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { workspaceZone } from '../zone.util';
import { RecurringTasksService } from '../../modules/recurring-tasks/recurring-tasks.service';
import { TASK_SERVICE_FILES } from '../../modules/tasks/__tests__/task-service-source';
import { SprintsService } from '../../modules/sprints/sprints.service';

/**
 * "Today" is the WORKSPACE's day, never the server's. The containers run in
 * UTC, so `setHours(0,0,0,0)` drew every day boundary at midnight in London.
 */
describe('day boundaries in the workspace’s zone', () => {
  const prisma: any = {
    companyLocation: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
    statusWorkflow: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    customer: { findFirst: jest.fn() },
    recurringTaskTemplate: { create: jest.fn().mockResolvedValue({ id: 't' }) },
  };
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  describe('workspaceZone', () => {
    it('workspace → organization → UTC', async () => {
      prisma.companyLocation.findFirst.mockResolvedValueOnce({ timezone: 'America/New_York' });
      expect(await workspaceZone(prisma, { spaceId: 's', organizationId: 'o' })).toBe('America/New_York');
      prisma.organization.findUnique.mockResolvedValueOnce({ timezone: 'Europe/Vienna' });
      expect(await workspaceZone(prisma, { organizationId: 'o' })).toBe('Europe/Vienna');
      prisma.organization.findUnique.mockResolvedValueOnce(null);
      expect(await workspaceZone(prisma, { organizationId: 'o' })).toBe('UTC');
    });
  });

  describe('a recurring template starting "today"', () => {
    const create = (startDate: string) =>
      new RecurringTasksService(prisma).create({ title: 'T', frequency: 'DAILY', startDate, organizationId: 'o', createdById: 'u' } as any);

    it('is accepted at 22:00 in New York (already tomorrow in UTC)', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-10T02:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
      prisma.organization.findUnique.mockResolvedValue({ timezone: 'America/New_York' });
      await expect(create('2026-10-09')).resolves.toBeDefined();
    });

    it('yesterday is still refused', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-10T02:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
      prisma.organization.findUnique.mockResolvedValue({ timezone: 'America/New_York' });
      await expect(create('2026-10-08')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('the sprint burndown counts a 00:30 Vienna completion on ITS day', async () => {
    const tx = {
      taskEvent: {
        findMany: jest.fn().mockResolvedValue([
          // 00:30 on 6 October in Vienna = 22:30 UTC on 5 October.
          { taskId: 't1', metadata: { newStatus: 'COMPLETED' }, createdAt: new Date('2026-10-05T22:30:00Z') },
        ]),
      },
    };
    const days = await (new SprintsService(prisma) as any).buildDailyBurndown(
      tx,
      [{ id: 't1', storyPoints: 5 }],
      new Date('2026-10-04T22:00:00Z'), // 5 Oct 00:00 Vienna
      new Date('2026-10-07T21:59:00Z'), // 7 Oct 23:59 Vienna
      5,
      'Europe/Vienna',
    );
    expect(days.map((d: any) => d.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(days.map((d: any) => d.remaining)).toEqual([5, 0, 0]);
  });

  it.each([
    // TasksService is a facade; its day logic lives in the collaborators beside it.
    ...TASK_SERVICE_FILES.map((f) => `modules/tasks/${f}`),
    'modules/recurring-tasks/recurring-tasks.service.ts',
    'modules/sprints/sprints.service.ts',
  ])('%s draws no day boundary on the server clock', (file) => {
    // Comments stripped first — one of them quotes the old line on purpose.
    const src = readFileSync(join(__dirname, '..', '..', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\.setHours\(\s*(0|23)\s*,/);
  });
});
