import { ConflictException, NotFoundException } from '@nestjs/common';
import { RecurringRunnerService, RECURRING_RUN_TAKEN } from '../recurring-runner.service';

/*
  A run is CLAIMED (compare-and-swap on the planned nextRunAt) and made in ONE
  transaction; the next run follows the plan, not the clock; a job is announced
  like a typed one; an archived workspace pauses the repeat; somebody who left is
  never handed the job.
*/
const PLANNED = new Date('2026-11-02T08:00:00Z'); // 09:00 in Vienna

function build(over: { claimed?: number; spaceActive?: boolean; members?: string[]; rostered?: string[] } = {}) {
  const template = {
    id: 'tpl',
    title: 'Clean the lobby',
    description: null,
    priority: 'MEDIUM',
    spaceId: 'sp',
    workflowId: null,
    customerId: null,
    locationLat: null,
    locationLng: null,
    locationAddress: null,
    estimatedHours: null,
    organizationId: 'org',
    assigneeIds: ['ana', 'gone'],
    checklist: [{ text: 'Mop' }],
    frequency: 'DAILY',
    dayOfWeek: null,
    dayOfMonth: null,
    customDays: null,
    startDate: PLANNED,
    endDate: null,
    nextRunAt: PLANNED,
    lastGeneratedAt: null,
    isActive: true,
    createdById: 'boss',
  };
  const prisma: any = {
    recurringTaskTemplate: {
      findUnique: jest.fn().mockResolvedValue(template),
      findMany: jest.fn().mockResolvedValue([template]),
      updateMany: jest.fn().mockResolvedValue({ count: over.claimed ?? 1 }),
    },
    companyLocation: {
      findUnique: jest.fn().mockResolvedValue({ isActive: over.spaceActive ?? true }),
      findFirst: jest.fn().mockResolvedValue({ timezone: 'Europe/Vienna' }),
    },
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Vienna' }) },
    user: { findMany: jest.fn().mockResolvedValue((over.members ?? ['ana']).map((id) => ({ id }))) },
    spaceAssignment: {
      findMany: jest.fn().mockResolvedValue((over.rostered ?? ['ana']).map((userId) => ({ userId }))),
    },
    workflowStatus: { findFirst: jest.fn() },
    task: {
      create: jest.fn().mockResolvedValue({ id: 'job' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'job', organizationId: 'org' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'job' }),
    },
    checklistItem: { createMany: jest.fn() },
    taskAssignee: { createMany: jest.fn(), create: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const records = { announceNew: jest.fn().mockResolvedValue(undefined) };
  return { service: new RecurringRunnerService(prisma, records as any), prisma, records };
}

describe('the scheduler', () => {
  it('next run = the PLANNED run plus a period, whenever the poller happened to tick', async () => {
    const { service, prisma } = build();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-02T08:04:37Z'));
    try {
      await service.runDue();
    } finally {
      jest.useRealTimers();
    }
    expect(prisma.recurringTaskTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: 'tpl', nextRunAt: PLANNED, isActive: true },
      data: { lastGeneratedAt: expect.any(Date), nextRunAt: new Date('2026-11-03T08:00:00Z') },
    });
  });

  it('claims and makes the job in one transaction, announced like a typed one, people who left skipped', async () => {
    const { service, prisma, records } = build({ members: ['ana'] });
    expect(await service.runDue()).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.task.create.mock.calls[0][0].data).toMatchObject({ assignedToId: 'ana', status: 'ASSIGNED' });
    expect(prisma.taskAssignee.createMany.mock.calls[0][0].data.map((r: any) => r.userId)).toEqual(['ana']);
    expect(records.announceNew).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job' }),
      'boss',
      'ana',
      expect.objectContaining({ source: 'recurring_template', templateId: 'tpl' }),
    );
  });

  it('somebody no longer in the workspace is not given the job', async () => {
    const { service, prisma } = build({ members: ['ana', 'gone'], rostered: [] });
    await service.runDue();
    expect(prisma.task.create.mock.calls[0][0].data.assignedToId).toBeUndefined();
  });

  it('an archived workspace pauses the repeat and makes nothing', async () => {
    const { service, prisma } = build({ spaceActive: false });
    expect(await service.runDue()).toBe(0);
    expect(prisma.recurringTaskTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: 'tpl' },
      data: { isActive: false },
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });
});

describe('Generate now', () => {
  it('claims the planned run exactly as the scheduler does — a run already made is 409, no second job', async () => {
    const { service, prisma, records } = build({ claimed: 0 });
    const err = await service.generate({ id: 'tpl', organizationId: 'org', userId: 'anna' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: RECURRING_RUN_TAKEN });
    expect(prisma.recurringTaskTemplate.updateMany.mock.calls[0][0].where).toEqual({
      id: 'tpl',
      nextRunAt: PLANNED,
      isActive: true,
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(records.announceNew).not.toHaveBeenCalled();
  });

  it('a run taken early moves the schedule on from IT', async () => {
    const { service, prisma } = build();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-01T15:00:00Z')); // the day before the planned run
    try {
      await service.generate({ id: 'tpl', organizationId: 'org', userId: 'anna' });
    } finally {
      jest.useRealTimers();
    }
    expect(prisma.recurringTaskTemplate.updateMany.mock.calls[0][0].data.nextRunAt).toEqual(
      new Date('2026-11-03T08:00:00Z'),
    );
  });

  it('an archived workspace refuses (404) and pauses the repeat', async () => {
    const { service, prisma } = build({ spaceActive: false });
    await expect(service.generate({ id: 'tpl', organizationId: 'org', userId: 'anna' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });
});
