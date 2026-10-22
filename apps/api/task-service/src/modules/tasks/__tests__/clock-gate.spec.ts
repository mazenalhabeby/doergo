/**
 * Clocked in to start work.
 *
 * Job time used to run with nobody on the clock: an employee could start a job
 * from home, or the office could start it for them, and the job's hours and the
 * timesheet then told two different stories.
 */
import { Test } from '@nestjs/testing';
import { TaskAccessService } from '../access/task-access.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { OBJECT_STORE } from '@hbcfield/shared/storage';
import { Role, TaskStatus, stepStartsWork, stepCapabilities, spaceRunsClock } from '@hbcfield/shared';
import { TasksService } from '../tasks.service';
import { TASK_SERVICE_PARTS } from '../task-service-parts';
import { RolePoolService } from '../assignment/role-pool.service';
import { PrismaService } from '@hbcfield/shared';
import { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';
import { JobTimeService } from '../handover/job-time.service';
import { PresenceService } from '../../attendance/presence/presence.service';
import { ClockGateService } from '../handover/clock-gate.service';
import { CrewService } from '../handover/crew.service';

/** The crew rules are their own service (crew.spec.ts); here they say nothing. */
const crewStub = () => ({
  joinAs: jest.fn().mockResolvedValue(null),
  assertMayMoveStep: jest.fn().mockResolvedValue(undefined),
  leaveOtherJobs: jest.fn().mockResolvedValue(undefined),
  announceStart: jest.fn().mockResolvedValue(undefined),
  viewFor: jest.fn().mockResolvedValue(null),
});

describe('the rule (shared)', () => {
  it('starting or resuming work needs the clock; taking a job on or pausing it does not', () => {
    const at = (key: string) => stepStartsWork(key, stepCapabilities(null, key));
    expect(at(TaskStatus.EN_ROUTE)).toBe(true);
    expect(at(TaskStatus.ARRIVED)).toBe(true);
    expect(at(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(at(TaskStatus.ACCEPTED)).toBe(false);
    expect(at(TaskStatus.BLOCKED)).toBe(false);
    expect(at(TaskStatus.COMPLETED)).toBe(false);
  });

  it('reads a custom workflow by its step capabilities, not by names', () => {
    const wf = { name: 'Workshop', statuses: [{ key: 'ON_THE_BENCH', capabilities: ['timer'] }, { key: 'QUEUED', capabilities: [] }] };
    expect(stepStartsWork('ON_THE_BENCH', stepCapabilities(wf, 'ON_THE_BENCH'))).toBe(true);
    expect(stepStartsWork('QUEUED', stepCapabilities(wf, 'QUEUED'))).toBe(false);
  });

  it('a workspace runs a clock only with Time Tracking on (its own list, else the organization\'s)', () => {
    expect(spaceRunsClock(['time_tracking'], [])).toBe(true);
    expect(spaceRunsClock(null, ['time_tracking'])).toBe(true);
    expect(spaceRunsClock([], ['time_tracking'])).toBe(false);
    expect(spaceRunsClock(null, null)).toBe(false);
  });
});

describe('TasksService.updateStatus — clocked in to start work', () => {
  let service: TasksService;
  const prisma: any = {
    task: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    taskAssignee: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    taskEvent: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    companyLocation: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn() },
    spaceAssignment: { findMany: jest.fn() },
    spaceWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn() },
    timeEntry: { findFirst: jest.fn() },
  };

  const task = (over: Record<string, unknown> = {}) => ({
    id: 't1', title: 'Boiler', status: TaskStatus.ACCEPTED, organizationId: 'o1', assignedToId: 'mike',
    createdById: 'boss', spaceId: 's1', workflowId: null, dueDate: null,
    locationLat: null, locationLng: null, updatedAt: new Date(), space: { timezone: 'Europe/Vienna' },
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.task.updateMany.mockResolvedValue({ count: 1 });
    prisma.task.findUniqueOrThrow.mockImplementation(async () => ({ ...task(), status: TaskStatus.EN_ROUTE }));
    prisma.companyLocation.findUnique.mockResolvedValue({ enabledModules: ['time_tracking'], organization: { enabledModules: [] } });
    prisma.user.findMany.mockResolvedValue([{ id: 'mike', firstName: 'Mike', lastName: 'Weber' }]);
    prisma.timeEntry.findFirst.mockResolvedValue(null);
    prisma.spaceAssignment.findMany.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        TasksService, ...TASK_SERVICE_PARTS, TaskAccessService, { provide: JobTimeService, useValue: {} }, ClockGateService, { provide: CrewService, useValue: crewStub() }, { provide: RolePoolService, useValue: { holdsOpenRole: jest.fn().mockResolvedValue(false), syncSpots: jest.fn().mockResolvedValue(undefined) } }, { provide: PresenceService, useValue: { onJobMoved: jest.fn().mockResolvedValue(undefined) } },
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
  });

  const mike = { id: 't1', userId: 'mike', userRole: Role.EMPLOYEE, organizationId: 'o1' };
  const office = { id: 't1', userId: 'anna', userRole: Role.ADMIN, organizationId: 'o1' };

  it('refuses the worker who is not clocked in, with a code the screens translate', async () => {
    prisma.task.findUnique.mockResolvedValue(task());
    const err = await service.updateStatus({ ...mike, status: TaskStatus.EN_ROUTE }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'NOT_CLOCKED_IN' });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('lets them through once they are clocked in — anywhere, at a site or away', async () => {
    prisma.task.findUnique.mockResolvedValue(task());
    prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1' });
    await expect(service.updateStatus({ ...mike, status: TaskStatus.EN_ROUTE })).resolves.toBeDefined();
    expect(prisma.timeEntry.findFirst.mock.calls[0][0].where).toMatchObject({ organizationId: 'o1', userId: { in: ['mike'] }, status: 'CLOCKED_IN' });
  });

  it('the office starting it for someone: THAT person must be clocked in, and the refusal names them', async () => {
    prisma.task.findUnique.mockResolvedValue(task());
    const err = await service.updateStatus({ ...office, status: TaskStatus.EN_ROUTE }).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'ASSIGNEE_NOT_CLOCKED_IN', params: { name: 'Mike Weber' } });
    expect(prisma.timeEntry.findFirst.mock.calls[0][0].where.userId).toEqual({ in: ['mike'] });
  });

  it('never refuses accepting a job, or reporting an issue', async () => {
    prisma.task.findUnique.mockResolvedValue(task({ status: TaskStatus.ASSIGNED }));
    await expect(service.updateStatus({ ...mike, status: TaskStatus.ACCEPTED })).resolves.toBeDefined();
    prisma.task.findUnique.mockResolvedValue(task({ status: TaskStatus.IN_PROGRESS }));
    await expect(service.updateStatus({ ...mike, status: TaskStatus.BLOCKED, reason: 'Part missing' } as any)).resolves.toBeDefined();
    expect(prisma.timeEntry.findFirst).not.toHaveBeenCalled();
  });

  it('asks nothing of somebody with no clock anywhere, where the job\'s workspace runs none', async () => {
    prisma.task.findUnique.mockResolvedValue(task());
    prisma.companyLocation.findUnique.mockResolvedValue({ enabledModules: ['tasks'], organization: { enabledModules: ['time_tracking'] } });
    // Mike's only workspace has Time Tracking off too.
    prisma.spaceAssignment.findMany.mockResolvedValue([{ userId: 'mike', space: { enabledModules: [], organization: { enabledModules: ['time_tracking'] } } }]);
    await expect(service.updateStatus({ ...mike, status: TaskStatus.EN_ROUTE })).resolves.toBeDefined();
    expect(prisma.timeEntry.findFirst).not.toHaveBeenCalled();
  });

  it('follows the person: a warehouse job with no clock still needs the worker who clocks in at the office', async () => {
    prisma.task.findUnique.mockResolvedValue(task());
    prisma.companyLocation.findUnique.mockResolvedValue({ enabledModules: [], organization: { enabledModules: ['time_tracking'] } });
    prisma.spaceAssignment.findMany.mockResolvedValue([{ userId: 'mike', space: { enabledModules: ['time_tracking'], organization: { enabledModules: [] } } }]);
    const err = await service.updateStatus({ ...mike, status: TaskStatus.EN_ROUTE }).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'NOT_CLOCKED_IN' });
    // Clocked in at the office: the warehouse job starts.
    prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1' });
    await expect(service.updateStatus({ ...mike, status: TaskStatus.EN_ROUTE })).resolves.toBeDefined();
  });

  it('never holds an external member to a clock they do not have', async () => {
    prisma.task.findUnique.mockResolvedValue(task());
    prisma.user.findMany.mockResolvedValue([]); // the query excludes isExternal
    await expect(service.updateStatus({ ...mike, status: TaskStatus.EN_ROUTE })).resolves.toBeDefined();
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ isExternal: false });
  });

  describe('the office starting a job for someone', () => {
    beforeEach(() => {
      prisma.timeEntry.findFirst.mockResolvedValue({ userId: 'mike', clockInAt: new Date(Date.now() - 3 * 3_600_000) });
      prisma.user.findUnique = jest.fn().mockResolvedValue({ firstName: 'Anna', lastName: 'Müller' });
    });

    it('needs a reason, and the refusal names the person and their clock-in', async () => {
      prisma.task.findUnique.mockResolvedValue(task());
      const err = await service.updateStatus({ ...office, status: TaskStatus.EN_ROUTE }).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'OFFICE_START_REASON_REQUIRED' });
      expect(err.getResponse().params.clockInAt).toBeTruthy();
      expect(prisma.task.updateMany).not.toHaveBeenCalled();
    });

    it('with a reason: recorded as the office FOR Mike, and Mike is told', async () => {
      prisma.task.findUnique.mockResolvedValue(task());
      await service.updateStatus({ ...office, status: TaskStatus.EN_ROUTE, onBehalf: { reason: 'Phone is dead, he called from site' } } as any);
      expect(prisma.taskEvent.create.mock.calls[0][0].data.metadata).toMatchObject({ byOffice: true, forUserId: 'mike', officeReason: 'Phone is dead, he called from site' });
      const emit = (service as any).status.notificationClient.emit as jest.Mock;
      expect(emit.mock.calls.find((c: any[]) => c[0] === 'task_started_for_you')?.[1]).toMatchObject({ userId: 'mike', reason: 'Phone is dead, he called from site' });
    });

    it('a start time before their clock-in, or in the future, is refused', async () => {
      prisma.task.findUnique.mockResolvedValue(task());
      for (const at of [new Date(Date.now() - 5 * 3_600_000), new Date(Date.now() + 3_600_000)]) {
        const err = await service.updateStatus({ ...office, status: TaskStatus.EN_ROUTE, onBehalf: { reason: 'x', at: at.toISOString() } } as any).catch((e) => e);
        expect(err.getResponse()).toMatchObject({ code: 'OFFICE_START_TIME_OUTSIDE_SHIFT' });
      }
    });

    it('the worker moving their own job is never asked for a reason', async () => {
      prisma.task.findUnique.mockResolvedValue(task());
      await expect(service.updateStatus({ ...mike, status: TaskStatus.EN_ROUTE })).resolves.toBeDefined();
      expect(prisma.taskEvent.create.mock.calls[0][0].data.metadata.byOffice).toBeUndefined();
    });
  });

  describe('resume after a pause at clock-out', () => {
    const paused = (over: Record<string, unknown> = {}) => task({ status: TaskStatus.IN_PROGRESS, pausedAt: new Date('2026-10-01T15:00:00Z'), pausedById: 'mike', ...over });

    it('is a move into work: off the clock, it asks to clock in first', async () => {
      prisma.task.findUnique.mockResolvedValue(paused());
      const err = await service.resumeWork({ ...mike }).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'NOT_CLOCKED_IN' });
      expect(prisma.task.updateMany).not.toHaveBeenCalled();
    });

    it('clocked in: clears the pause and records it', async () => {
      prisma.task.findUnique.mockResolvedValue(paused());
      prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1' });
      await service.resumeWork({ ...mike });
      expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { id: 't1', pausedAt: { not: null } }, data: { pausedAt: null, pausedById: null } });
      expect(prisma.taskEvent.create.mock.calls[0][0].data.eventType).toBe('RESUMED');
    });

    it('the new worker the job was given to may pick it up', async () => {
      prisma.task.findUnique.mockResolvedValue(paused({ assignedToId: 'ali' }));
      prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1' });
      await expect(service.resumeWork({ ...mike, userId: 'ali' })).resolves.toBeDefined();
      await expect(service.resumeWork({ ...mike, userId: 'stranger' })).rejects.toThrow('resume');
    });

    it('a second tap (or an offline replay) writes nothing', async () => {
      prisma.task.findUnique.mockResolvedValue(task({ status: TaskStatus.IN_PROGRESS }));
      await service.resumeWork({ ...mike });
      expect(prisma.task.updateMany).not.toHaveBeenCalled();
      expect(prisma.timeEntry.findFirst).not.toHaveBeenCalled();
    });

    it('any move of a paused job ends the pause', async () => {
      prisma.task.findUnique.mockResolvedValue(paused());
      await service.updateStatus({ ...mike, status: TaskStatus.BLOCKED, reason: 'Part missing' } as any);
      expect(prisma.task.updateMany.mock.calls[0][0].data).toMatchObject({ status: TaskStatus.BLOCKED, pausedAt: null, pausedById: null });
    });
  });
});
