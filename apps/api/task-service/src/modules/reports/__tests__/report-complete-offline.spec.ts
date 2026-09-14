/**
 * Completing a job with its report from a phone that was offline.
 */
import { TaskStatus } from '@hbcfield/shared';
import { ReportsService } from '../reports.service';

const TAP = new Date('2026-09-14T09:40:00.000Z');

function build(task: Record<string, unknown>) {
  const created: any[] = [];
  const prisma: any = {
    task: {
      findUnique: jest.fn().mockResolvedValue({ id: 't1', status: TaskStatus.IN_PROGRESS, assignedToId: 'u1', organizationId: 'o1', assetId: null, serviceReport: null, updatedAt: new Date(), ...task }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't1', status: TaskStatus.COMPLETED }),
    },
    taskAssignee: { findFirst: jest.fn().mockResolvedValue(null) },
    taskEvent: {
      findFirst: jest.fn().mockResolvedValue({ createdAt: new Date('2026-09-14T11:00:00Z'), metadata: { occurredAt: '2026-09-14T09:05:00.000Z' } }),
      create: jest.fn(async ({ data }: any) => data),
    },
    serviceReport: {
      create: jest.fn(async ({ data }: any) => {
        created.push(data);
        return { id: data.id ?? 'r-server', ...data };
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => ({ id: where.id })),
    },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const service = new ReportsService(prisma, null, {} as any, { emit: jest.fn() } as any);
  return { service, prisma, created };
}

const complete = (over: Record<string, unknown> = {}) => ({
  taskId: 't1', summary: 'Nozzle replaced', workDuration: 2100, userId: 'u1', userRole: 'EMPLOYEE', organizationId: 'o1',
  id: '0190f3c2-7b1a-7c3d-9e4f-r00000000001',
  evidence: { occurredAt: TAP.toISOString() },
  ...over,
});

describe('completing a job offline', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-09-14T11:14:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  it('records the report under the phone id at the time of the tap, claiming the task', async () => {
    const { service, prisma, created } = build({});
    await service.create(complete());
    expect(created[0]).toMatchObject({ id: '0190f3c2-7b1a-7c3d-9e4f-r00000000001', completedAt: TAP });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { id: 't1', status: TaskStatus.IN_PROGRESS }, data: { status: TaskStatus.COMPLETED } });
    expect(prisma.taskEvent.create.mock.calls[0][0].data.metadata).toMatchObject({ occurredAt: TAP.toISOString(), occurrenceFlags: expect.arrayContaining(['RECORDED_OFFLINE']) });
  });

  it('returns the same report when the completion is sent again', async () => {
    const { service, prisma } = build({ status: TaskStatus.COMPLETED, serviceReport: { id: '0190f3c2-7b1a-7c3d-9e4f-r00000000001' } });
    const res: any = await service.create(complete());
    expect(res.data.id).toBe('0190f3c2-7b1a-7c3d-9e4f-r00000000001');
    expect(prisma.serviceReport.create).not.toHaveBeenCalled();
  });

  it('is a conflict, naming where the task is, when it moved on meanwhile', async () => {
    const { service } = build({ status: TaskStatus.CANCELED });
    await expect(service.create(complete())).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'TASK_STATE_CONFLICT', params: { current: expect.objectContaining({ status: TaskStatus.CANCELED }) } }),
    });
  });

  it('refuses a completion timed before the start it closes', async () => {
    const { service } = build({});
    await expect(service.create(complete({ evidence: { occurredAt: '2026-09-14T09:00:00.000Z' } }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OUT_OF_ORDER' }),
    });
  });

  it('does not create a report when a racing change claimed the task first', async () => {
    const { service, prisma } = build({});
    prisma.task.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.create(complete())).rejects.toMatchObject({ status: 409 });
    expect(prisma.serviceReport.create).not.toHaveBeenCalled();
  });
});
