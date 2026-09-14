/**
 * A status change that arrives late from a phone that was offline.
 *
 * The server used to stamp its own clock, judge arrival by wherever the phone
 * was at sync time, and apply the change on top of whatever the task had become
 * meanwhile. These pin the new rules.
 */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OBJECT_STORE } from '@hbcfield/shared/storage';
import { Role, TaskStatus } from '@hbcfield/shared';
import { TasksService } from '../tasks.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkflowConfigCache } from '../../../common/cache/workflow-config-cache.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';
import { PresenceService } from '../../attendance/presence/presence.service';

const NOW = new Date();
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function base(over: Record<string, unknown> = {}) {
  return {
    id: 't1', title: 'Boiler', status: TaskStatus.EN_ROUTE, organizationId: 'o1', assignedToId: 'tech',
    createdById: 'boss', spaceId: null, workflowId: null, dueDate: null,
    locationLat: 47.9186, locationLng: 13.7991, updatedAt: minutesAgo(1), space: { timezone: 'Europe/Vienna' },
    ...over,
  };
}

describe('status change recorded offline', () => {
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
    taskAssignee: { findFirst: jest.fn().mockResolvedValue(null) },
    taskEvent: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    companyLocation: { findUnique: jest.fn().mockResolvedValue(null) },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.taskEvent.findFirst.mockResolvedValue(null);
    prisma.task.updateMany.mockResolvedValue({ count: 1 });
    prisma.task.findUniqueOrThrow.mockImplementation(async () => ({ ...base(), status: TaskStatus.ARRIVED }));
    const module = await Test.createTestingModule({
      providers: [
        TasksService, { provide: PresenceService, useValue: { onJobMoved: jest.fn().mockResolvedValue(undefined) } },
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

  const tech = { id: 't1', userId: 'tech', userRole: Role.EMPLOYEE, organizationId: 'o1' };
  const tapAt = minutesAgo(90);
  const fix = { lat: 47.9187, lng: 13.7992, accuracy: 8, fixAt: tapAt.toISOString() };

  it('records the tap time as the arrival, not the sync time', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    await service.updateStatus({ ...tech, status: TaskStatus.ARRIVED, expectedFrom: TaskStatus.EN_ROUTE, evidence: { occurredAt: tapAt.toISOString(), fix } });
    const update = prisma.task.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: 't1', status: TaskStatus.EN_ROUTE });
    expect(update.data.routeEndedAt.toISOString()).toBe(tapAt.toISOString());
    const event = prisma.taskEvent.create.mock.calls[0][0].data.metadata;
    expect(event.occurredAt).toBe(tapAt.toISOString());
    expect(event.occurrenceFlags).toEqual(expect.arrayContaining(['RECORDED_OFFLINE', 'UNANCHORED']));
  });

  it('judges arrival by the fix taken at the tap, not the coordinates sent at sync', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    // The phone is now 30 km away (driving home), but the tap was at the door.
    await expect(
      service.updateStatus({ ...tech, status: TaskStatus.ARRIVED, lat: 48.2, lng: 16.37, accuracy: 5, evidence: { occurredAt: tapAt.toISOString(), fix } }),
    ).resolves.toMatchObject({ success: true });
  });

  it('refuses a fix that was not taken at the tap', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    const stale = { ...fix, fixAt: minutesAgo(200).toISOString() };
    const err = await service.updateStatus({ ...tech, status: TaskStatus.ARRIVED, evidence: { occurredAt: tapAt.toISOString(), fix: stale } }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'FIX_NOT_AT_TAP' });
  });

  it('accepts but flags a mocked location', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    await service.updateStatus({ ...tech, status: TaskStatus.ARRIVED, evidence: { occurredAt: tapAt.toISOString(), fix: { ...fix, mocked: true } } });
    expect(prisma.taskEvent.create.mock.calls[0][0].data.metadata.occurrenceFlags).toContain('FIX_MOCKED');
  });

  it('409s with the current task when it moved on while the phone was offline', async () => {
    prisma.task.findUnique.mockResolvedValue(base({ status: TaskStatus.CANCELED }));
    const err = await service.updateStatus({ ...tech, status: TaskStatus.ARRIVED, expectedFrom: TaskStatus.EN_ROUTE, evidence: { occurredAt: tapAt.toISOString(), fix } }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'TASK_STATE_CONFLICT', params: { current: { status: TaskStatus.CANCELED } } });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('treats "already there" as done without a second event', async () => {
    prisma.task.findUnique.mockResolvedValue(base({ status: TaskStatus.ARRIVED }));
    const res: any = await service.updateStatus({ ...tech, status: TaskStatus.ARRIVED, expectedFrom: TaskStatus.EN_ROUTE, evidence: { occurredAt: tapAt.toISOString(), fix } });
    expect(res.success).toBe(true);
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
  });

  it('409s when another change wins the race between check and write', async () => {
    prisma.task.findUnique
      .mockResolvedValueOnce(base())
      .mockResolvedValueOnce({ id: 't1', status: TaskStatus.BLOCKED, assignedToId: 'tech', updatedAt: NOW });
    prisma.task.updateMany.mockResolvedValue({ count: 0 });
    const err = await service.updateStatus({ ...tech, status: TaskStatus.ARRIVED, evidence: { occurredAt: tapAt.toISOString(), fix } }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'TASK_STATE_CONFLICT' });
  });

  it('orders against the previous change\'s own time, not when it was written', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    // EN_ROUTE happened at 09:00 offline but was written seconds ago.
    prisma.taskEvent.findFirst.mockResolvedValue({ createdAt: NOW, metadata: { occurredAt: minutesAgo(95).toISOString() } });
    await expect(
      service.updateStatus({ ...tech, status: TaskStatus.ARRIVED, evidence: { occurredAt: tapAt.toISOString(), fix } }),
    ).resolves.toMatchObject({ success: true });
    // …and a change claiming to precede it is refused.
    prisma.taskEvent.findFirst.mockResolvedValue({ createdAt: NOW, metadata: { occurredAt: minutesAgo(80).toISOString() } });
    const err = await service.updateStatus({ ...tech, status: TaskStatus.ARRIVED, evidence: { occurredAt: tapAt.toISOString(), fix } }).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'OUT_OF_ORDER' });
  });

  it('tells a member the job is no longer theirs in a way the phone can translate', async () => {
    prisma.task.findUnique.mockResolvedValue(base({ assignedToId: 'karim' }));
    const err = await service.updateStatus({ ...tech, status: TaskStatus.ARRIVED, evidence: { occurredAt: tapAt.toISOString(), fix } }).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'TASK_REASSIGNED' });
  });
});
