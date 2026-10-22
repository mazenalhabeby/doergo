import { Test, TestingModule } from '@nestjs/testing';
import { TaskAccessService } from '../access/task-access.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@hbcfield/shared';

import { TasksService } from '../tasks.service';
import { TASK_SERVICE_PARTS } from '../task-service-parts';
import { RolePoolService } from '../assignment/role-pool.service';
import { PrismaService } from '@hbcfield/shared';
import { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';
import { OBJECT_STORE } from '@hbcfield/shared/storage';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { JobTimeService } from '../handover/job-time.service';
import { PresenceService } from '../../attendance/presence/presence.service';
import { ClockGateService } from '../handover/clock-gate.service';
import { CrewService } from '../handover/crew.service';

/**
 * A subtask is part of its parent's job.
 *
 *   • It lives where the parent lives — the same workspace and task type. It
 *     was created with neither, so it fell out of every space-scoped list.
 *   • Its linked records go through the same ownership check create() and
 *     update() use — asset/phase/sprint/epic ids were written unchecked.
 *   • Naming somebody on it is ASSIGNING, asked as assign() asks it: "create
 *     tasks" at one site was otherwise an assign right over the organization.
 */
describe('TasksService.createSubtask — inherits, checks, and assigns only with the assign right', () => {
  let service: TasksService;

  const prisma: any = {
    task: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    taskEvent: { create: jest.fn() },
    spaceAssignment: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    workflowStatus: { findFirst: jest.fn() },
    asset: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    customerUnit: { findFirst: jest.fn() },
    phase: { findFirst: jest.fn() },
    sprint: { findFirst: jest.fn() },
    epic: { findFirst: jest.fn() },
  };

  const ORG = 'org-1';
  const parent = { id: 'p-1', title: 'Parent', organizationId: ORG, spaceId: 'space-A', workflowId: 'wf-1', depth: 0, parentId: null };
  /** May create tasks at site A only — no assign right anywhere. */
  const siteACreator = { userId: 'u-1', userRole: Role.EMPLOYEE, organizationId: ORG, canCreateTasks: false, createSpaceIds: ['space-A'] };
  const sub = (over: Record<string, unknown> = {}) => service.createSubtask({ parentId: 'p-1', title: 'Step', ...siteACreator, ...over });
  const written = () => prisma.task.create.mock.calls[0][0].data;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.task.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id === 'p-1' ? parent : null),
    );
    prisma.task.findFirst.mockResolvedValue(null);
    prisma.task.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data }));
    prisma.taskEvent.create.mockResolvedValue({});
    prisma.workflowStatus.findFirst.mockResolvedValue({ key: 'TODO' });
    for (const k of ['asset', 'phase', 'sprint', 'epic']) prisma[k].findFirst.mockResolvedValue({ id: 'owned' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService, ...TASK_SERVICE_PARTS, TaskAccessService,
        { provide: JobTimeService, useValue: {} },
        ClockGateService,
        { provide: CrewService, useValue: {} },
        { provide: RolePoolService, useValue: {} },
        { provide: PresenceService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
        { provide: ConfigService, useValue: { get: (_k: string, d: unknown) => d } },
        { provide: WorkflowConfigCache, useValue: { getWorkflow: jest.fn().mockResolvedValue(null) } },
        { provide: NotificationRoutingService, useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [] }) } },
        MediaSigner,
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = module.get(TasksService);
    (service as any).support.invalidateStatusCountsCache = jest.fn();
  });

  it('inherits the parent’s workspace and task type, starting at that flow’s first step', async () => {
    await sub();
    expect(written()).toMatchObject({ spaceId: 'space-A', workflowId: 'wf-1', status: 'TODO', organizationId: ORG });
  });

  it.each(['assetId', 'phaseId', 'sprintId', 'epicId'])('drops a %s of another organization', async (key) => {
    const model = { assetId: 'asset', phaseId: 'phase', sprintId: 'sprint', epicId: 'epic' }[key]!;
    prisma[model].findFirst.mockResolvedValue(null);
    await sub({ [key]: 'theirs' });
    expect(prisma[model].findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'theirs', organizationId: ORG }) }),
    );
    expect(written()[key]).toBeNull();
  });

  it('refuses an assignee from a creator who holds no assign right on that workspace', async () => {
    await expect(sub({ assignedToId: 'w-1' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('refuses a space-granted assigner naming somebody off that workspace’s roster', async () => {
    prisma.spaceAssignment.findFirst.mockResolvedValue(null);
    await expect(sub({ assignedToId: 'w-elsewhere', assignSpaceIds: ['space-A'] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('refuses an assignee who is not an active member of the organization', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(sub({ userRole: Role.ADMIN, assignedToId: 'foreign' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assigns when the caller may assign there and the person is rostered', async () => {
    prisma.spaceAssignment.findFirst.mockResolvedValue({ id: 'sa' });
    prisma.user.findFirst.mockResolvedValue({ id: 'w-1' });
    await sub({ assignedToId: 'w-1', assignSpaceIds: ['space-A'] });
    expect(written()).toMatchObject({ assignedToId: 'w-1' });
  });
});
