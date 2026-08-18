import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@hbcfield/shared';

import { TasksService } from '../tasks.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkflowConfigCache } from '../../../common/cache/workflow-config-cache.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';

/**
 * The per-task authorization gate.
 *
 * Every per-task mutation — comments, checklist items, assignees, status —
 * funnels through checkTaskAccess, so this is the boundary between one
 * customer's data and another's. Exercised through addComment, a caller that
 * does nothing else of consequence.
 *
 * The cases that matter are the ones where a caller HAS a relationship to a
 * task that is no longer in their organization: an assignment left behind by an
 * org transfer, or having created a task that has since moved. Both used to
 * grant access.
 */
describe('TasksService — per-task authorization', () => {
  let service: TasksService;

  const prisma = {
    task: { findUnique: jest.fn() },
    taskAssignee: { findFirst: jest.fn() },
    comment: { create: jest.fn() },
    taskEvent: { create: jest.fn() },
  };
  const notifications = { emit: jest.fn() };

  const OWN_ORG = 'org-own';
  const OTHER_ORG = 'org-other';

  const task = (over: Record<string, unknown> = {}) => ({
    id: 'task-1',
    organizationId: OWN_ORG,
    spaceId: 'space-1',
    createdById: 'someone-else',
    assignedToId: null,
    assignees: [],
    ...over,
  });

  /** addComment is the thinnest caller of the gate. */
  const attempt = (taskRow: Record<string, unknown>, caller: Record<string, unknown>) => {
    prisma.task.findUnique.mockResolvedValue(taskRow);
    return service.addComment({
      taskId: 'task-1',
      content: 'hello',
      userId: 'caller-1',
      userRole: Role.EMPLOYEE,
      organizationId: OWN_ORG,
      ...caller,
    } as never);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.taskAssignee.findFirst.mockResolvedValue(null);
    prisma.comment.create.mockResolvedValue({ id: 'c-1', content: 'hello', user: {} });
    prisma.taskEvent.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'NOTIFICATION_SERVICE', useValue: notifications },
        { provide: ConfigService, useValue: { get: (_k: string, d: unknown) => d } },
        { provide: WorkflowConfigCache, useValue: { getWorkflow: jest.fn().mockResolvedValue(null) } },
        { provide: NotificationRoutingService, useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [] }) } },
      ],
    }).compile();
    service = module.get<TasksService>(TasksService);
  });

  describe('the organization boundary comes first', () => {
    it('refuses a task in another organization, even to its assignee', async () => {
      // A stale assignment: the member moved orgs, the TaskAssignee row remains.
      await expect(
        attempt(task({ organizationId: OTHER_ORG, assignedToId: 'caller-1' }), {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a task in another organization to a co-assignee', async () => {
      await expect(
        attempt(task({ organizationId: OTHER_ORG, assignees: [{ userId: 'caller-1' }] }), {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an ADMIN a task outside their org even when they created it', async () => {
      // The old rule denied only when NEITHER held, so creating it was enough.
      await expect(
        attempt(task({ organizationId: OTHER_ORG, createdById: 'caller-1' }), { userRole: Role.ADMIN }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an ADMIN of another org a task in this one', async () => {
      await expect(
        attempt(task({ organizationId: OTHER_ORG }), { userRole: Role.ADMIN }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a view-all grant across the boundary', async () => {
      await expect(
        attempt(task({ organizationId: OTHER_ORG }), { canViewAllTasks: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('within the boundary', () => {
    it('allows the lead assignee', async () => {
      await expect(attempt(task({ assignedToId: 'caller-1' }), {})).resolves.toBeDefined();
    });

    it('allows a co-assignee listed on the task', async () => {
      await expect(attempt(task({ assignees: [{ userId: 'caller-1' }] }), {})).resolves.toBeDefined();
    });

    it('allows a co-assignee when the rows were not loaded with the task', async () => {
      prisma.taskAssignee.findFirst.mockResolvedValue({ id: 'ta-1' });
      await expect(attempt(task({ assignees: undefined }), {})).resolves.toBeDefined();
    });

    it('allows an ADMIN of the same org', async () => {
      await expect(attempt(task(), { userRole: Role.ADMIN })).resolves.toBeDefined();
    });

    it('allows a view-all grant in the same org', async () => {
      await expect(attempt(task(), { canViewAllTasks: true })).resolves.toBeDefined();
    });

    it('refuses a member with no relationship to the task', async () => {
      await expect(attempt(task(), {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('reports a missing task as not found, without leaking whether it exists elsewhere', async () => {
    prisma.task.findUnique.mockResolvedValue(null);
    await expect(
      service.addComment({
        taskId: 'nope',
        content: 'x',
        userId: 'caller-1',
        userRole: Role.EMPLOYEE,
        organizationId: OWN_ORG,
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
