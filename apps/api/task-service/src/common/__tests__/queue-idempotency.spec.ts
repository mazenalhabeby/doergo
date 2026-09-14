/**
 * Writes that go through BullMQ: one job per idempotency key, and error codes
 * that survive the trip from task-service to the gateway.
 */
jest.mock('bullmq', () => {
  const jobs = new Map<string, any>();
  class Job {
    static fromId = jest.fn(async (_q: unknown, id: string) => jobs.get(id) ?? null);
  }
  class UnrecoverableError extends Error {}
  return { Job, UnrecoverableError, Queue: class {}, QueueEvents: class { on() {} }, __jobs: jobs };
});

import { HttpException, ConflictException } from '@nestjs/common';
import { BaseQueueService, buildJobError, requestIdempotency, idempotentJobId } from '@hbcfield/shared';

const bull = jest.requireMock('bullmq') as any;

class TestQueue extends BaseQueueService {
  run(type: string, data: Record<string, unknown>) {
    return this.addJobAndWait(type, data, 50);
  }
}

function service(outcome: { result?: unknown; failedReason?: string }) {
  const added: any[] = [];
  const queue: any = {
    add: jest.fn(async (name: string, data: unknown, opts: any) => {
      const job = {
        id: opts.jobId,
        waitUntilFinished: jest.fn(async () => {
          if (outcome.failedReason) throw new Error('failed');
          return outcome.result;
        }),
      };
      added.push({ name, opts });
      bull.__jobs.set(opts.jobId, { failedReason: outcome.failedReason, isFailed: async () => !!outcome.failedReason, remove: jest.fn(async () => bull.__jobs.delete(opts.jobId)) });
      return job;
    }),
    opts: { connection: {} },
  };
  const config = { get: () => undefined };
  const svc = new TestQueue(queue, config as any, 'tasks', 'TestQueue');
  (svc as any).queueEvents = {};
  return { svc, queue, added };
}

beforeEach(() => bull.__jobs.clear());

describe('idempotent job ids', () => {
  it('derives the job id from the request key, and a random one without', async () => {
    const { svc, added } = service({ result: { ok: true } });
    await requestIdempotency.run({ key: '0190f3c2-7b1a-7c3d-9e4f-000000000001', userId: 'u1' }, () => svc.run('task.addComment', {}));
    await svc.run('task.addComment', {});
    expect(added[0].opts.jobId).toBe('task.addComment__u1__0190f3c2-7b1a-7c3d-9e4f-000000000001');
    expect(added[1].opts.jobId).toMatch(/^task\.addComment-\d+-/);
    expect(idempotentJobId('x')).toBeNull();
  });

  it('removes a failed job with the same id so the retry runs again', async () => {
    const id = 'task.addComment__u1__0190f3c2-7b1a-7c3d-9e4f-000000000002';
    const remove = jest.fn(async () => bull.__jobs.delete(id));
    bull.__jobs.set(id, { isFailed: async () => true, remove });
    const { svc } = service({ result: { ok: true } });
    await requestIdempotency.run({ key: '0190f3c2-7b1a-7c3d-9e4f-000000000002', userId: 'u1' }, () => svc.run('task.addComment', {}));
    expect(remove).toHaveBeenCalled();
  });
});

describe('error codes across the queue', () => {
  it('buildJobError keeps code and params from an HttpException', () => {
    const err = buildJobError(new ConflictException({ message: 'Moved on', code: 'TASK_STATE_CONFLICT', params: { current: { status: 'CANCELED' } } }));
    expect(JSON.parse(err.message)).toEqual({ message: 'Moved on', statusCode: 409, code: 'TASK_STATE_CONFLICT', params: { current: { status: 'CANCELED' } } });
  });

  it('the gateway rethrows with the code and params intact', async () => {
    const failedReason = JSON.stringify({ message: 'Moved on', statusCode: 409, code: 'TASK_STATE_CONFLICT', params: { current: { status: 'CANCELED' } } });
    const { svc } = service({ failedReason });
    const err: any = await svc.run("task.updateStatus", {}).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ code: 'TASK_STATE_CONFLICT', params: { current: { status: 'CANCELED' } } });
  });
});
