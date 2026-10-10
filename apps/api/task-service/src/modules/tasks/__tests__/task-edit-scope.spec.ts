import { Test, TestingModule } from '@nestjs/testing';
import { TaskAccessService } from '../../../common/task-access/task-access.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@hbcfield/shared';

import { TasksService } from '../tasks.service';
import { TASK_SERVICE_PARTS } from '../task-service-parts';
import { RolePoolService } from '../role-pool.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkflowConfigCache } from '../../../common/cache/workflow-config-cache.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';
import { OBJECT_STORE } from '@hbcfield/shared/storage';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { JobTimeService } from '../handover/job-time.service';
import { PresenceService } from '../../attendance/presence/presence.service';
import { ClockGateService } from '../handover/clock-gate.service';
import { CrewService } from '../handover/crew.service';

/**
 * Editing, moving and reassigning a task are decided on the task's OWN space.
 *
 *   • PUT /tasks/:id — the gateway guard passes on a canCreateTasks grant in ANY
 *     space when the body names none, and update() only checked the
 *     organization: a member who may create tasks at one site rewrote and MOVED
 *     any task in the organization, and wrote asset/phase/sprint/epic ids
 *     unchecked (another tenant's included).
 *   • PATCH /tasks/:id/assign — skipped the two checks addAssignee makes, so a
 *     member granted "assign" at one site reassigned any task to anybody.
 *   • GET /tasks — `?customerId[not]=x` reached the Prisma where as an operator.
 */
describe('TasksService — edit / move / assign scope', () => {
  let service: TasksService;

  const prisma: any = {
    task: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    taskAssignee: { findFirst: jest.fn() },
    taskEvent: { create: jest.fn() },
    companyLocation: { findFirst: jest.fn() },
    spaceAssignment: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    asset: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    customerUnit: { findFirst: jest.fn() },
    phase: { findFirst: jest.fn() },
    sprint: { findFirst: jest.fn() },
    epic: { findFirst: jest.fn() },
  };

  const ORG = 'org-1';
  const taskRow = (over: Record<string, unknown> = {}) => ({
    id: 't-1',
    organizationId: ORG,
    spaceId: 'space-A',
    status: 'NEW',
    assignedToId: null,
    workflowId: null,
    openRoleId: null,
    ...over,
  });

  /** A member who may create tasks only at site A (a space role). */
  const siteACreator = {
    userId: 'u-1',
    userRole: Role.EMPLOYEE,
    organizationId: ORG,
    canCreateTasks: false,
    createSpaceIds: ['space-A'],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.task.update.mockImplementation(({ data }: any) => Promise.resolve({ ...taskRow(), ...data }));
    prisma.taskEvent.create.mockResolvedValue({});
    for (const k of ['asset', 'customer', 'customerUnit', 'phase', 'sprint', 'epic', 'companyLocation']) {
      prisma[k].findFirst.mockResolvedValue({ id: 'owned' });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService, ...TASK_SERVICE_PARTS, TaskAccessService,
        { provide: JobTimeService, useValue: {} },
        ClockGateService,
        { provide: CrewService, useValue: {} },
        { provide: RolePoolService, useValue: { holdsOpenRole: jest.fn().mockResolvedValue(false), syncSpots: jest.fn() } },
        { provide: PresenceService, useValue: { onJobMoved: jest.fn().mockResolvedValue(undefined) } },
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
    // The status-count cache is Redis; nothing to invalidate in a unit test.
    (service as any).support.invalidateStatusCountsCache = jest.fn();
  });

  describe('update (PUT /tasks/:id)', () => {
    it('refuses a site-A creator editing a task at site B', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow({ spaceId: 'space-B' }));
      await expect(service.update({ id: 't-1', title: 'x', ...siteACreator })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('refuses moving their own site-A task into site B', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow());
      await expect(
        service.update({ id: 't-1', spaceId: 'space-B', ...siteACreator }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('lets them edit a task at their own site', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow());
      await service.update({ id: 't-1', title: 'renamed', ...siteACreator });
      expect(prisma.task.update).toHaveBeenCalled();
    });

    it('refuses a destination workspace of another organization (or archived)', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow());
      prisma.companyLocation.findFirst.mockResolvedValue(null);
      await expect(
        service.update({ id: 't-1', spaceId: 'foreign-space', userId: 'a', userRole: Role.ADMIN, organizationId: ORG }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Through the shared tenant check, archived workspaces refused.
      expect(prisma.companyLocation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'foreign-space', organizationId: ORG, isActive: true } }),
      );
    });

    it.each(['assetId', 'phaseId', 'sprintId', 'epicId'])('refuses a %s of another organization', async (key) => {
      prisma.task.findUnique.mockResolvedValue(taskRow());
      const model = { assetId: 'asset', phaseId: 'phase', sprintId: 'sprint', epicId: 'epic' }[key]!;
      prisma[model].findFirst.mockResolvedValue(null);
      await expect(
        service.update({ id: 't-1', [key]: 'theirs', userId: 'a', userRole: Role.ADMIN, organizationId: ORG }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma[model].findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'theirs', organizationId: ORG }) }),
      );
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('never writes the caller’s grants into the change log', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow());
      await service.update({ id: 't-1', title: 'renamed', ...siteACreator, canViewAllTasks: true, viewAllSpaceIds: ['x'] });
      const changes = prisma.taskEvent.create.mock.calls[0][0].data.metadata.changes;
      expect(changes).toEqual({ title: 'renamed' });
    });
  });

  describe('assign (PATCH /tasks/:id/assign)', () => {
    const siteAAssigner = { userId: 'u-1', userRole: Role.EMPLOYEE, organizationId: ORG, canAssignTasks: false, assignSpaceIds: ['space-A'] };

    it('refuses a site-A assigner on a task at site B', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow({ spaceId: 'space-B' }));
      await expect(service.assign({ id: 't-1', workerId: 'w-1', ...siteAAssigner })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('refuses naming somebody who is not on that site’s roster', async () => {
      prisma.task.findUnique.mockResolvedValue(taskRow());
      prisma.spaceAssignment.findFirst.mockResolvedValue(null);
      await expect(service.assign({ id: 't-1', workerId: 'w-elsewhere', ...siteAAssigner })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });

  describe('list filters (GET /tasks)', () => {
    it('drops an object where an id belongs — never a Prisma operator', async () => {
      prisma.task.findMany.mockResolvedValue([]);
      prisma.task.count.mockResolvedValue(0);
      await service
        .findAll({
          userId: 'a',
          userRole: Role.ADMIN,
          organizationId: ORG,
          customerId: { not: 'x' },
          unitId: { in: ['a'] },
          sprintId: { not: null },
          epicId: ['e'],
        })
        .catch(() => undefined);
      const where = JSON.stringify(prisma.task.findMany.mock.calls[0]?.[0]?.where ?? {});
      expect(where).not.toContain('"not"');
      expect(where).not.toContain('"customerId"');
      expect(where).not.toContain('"unitId"');
      expect(where).not.toContain('"sprintId"');
      expect(where).not.toContain('"epicId"');
    });
  });
});
