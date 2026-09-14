import { SyncPushService } from '../sync-push.service';
import { INTERNAL_DISPATCH_HEADER, internalDispatchSecret, isInternalDispatch } from '../../../common/throttler/internal-dispatch';
import type { SyncOperation } from '@hbcfield/shared';

const config: any = { get: (k: string) => ({ PORT: '4000', API_PREFIX: 'api/v1' } as any)[k] };
const caller = { headers: { authorization: 'Bearer tok', 'x-app-version': '1.0.6', cookie: 'nope' }, ip: '203.0.113.9' };
const id = (n: number) => `0190f3c2-7b1a-7c3d-9e4f-${String(n).padStart(12, '0')}`;

type Reply = { status: number; body?: any; replayed?: boolean } | Error;

function mockFetch(replies: Record<string, Reply | Reply[]>) {
  const calls: { url: string; init: any }[] = [];
  const fn = jest.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    const key = `${init.method} ${url.replace('http://127.0.0.1:4000/api/v1', '')}`;
    let reply = replies[key];
    if (Array.isArray(reply)) reply = reply.shift()!;
    if (!reply) reply = { status: 201, body: { data: { ok: true } } };
    if (reply instanceof Error) throw reply;
    const r = reply;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (h: string) => (h === 'idempotent-replayed' && r.replayed ? 'true' : null) },
      json: async () => r.body ?? {},
    } as any;
  });
  (global as any).fetch = fn;
  return { fn, calls };
}

const comment = (n: number, taskId = 't1', extra: Partial<SyncOperation> = {}): SyncOperation => ({
  id: id(n), op: 'task.comment', lane: `task:${taskId}`, payload: { params: { taskId }, body: { content: `note ${n}` } }, ...extra,
});
const status = (n: number, taskId = 't1', extra: Partial<SyncOperation> = {}): SyncOperation => ({
  id: id(n), op: 'task.status', lane: `task:${taskId}`, payload: { params: { taskId }, body: { status: 'ARRIVED' } }, ...extra,
});

describe('SyncPushService', () => {
  const service = new SyncPushService(config);

  it('replays each operation against its route with the caller credentials and the op id as key', async () => {
    const { calls } = mockFetch({});
    const res = await service.push(caller, [status(1)]);
    expect(res.results[0]).toMatchObject({ id: id(1), status: 'applied', body: { ok: true } });
    const { url, init } = calls[0];
    expect(url).toBe('http://127.0.0.1:4000/api/v1/tasks/t1/status');
    expect(init.method).toBe('PATCH');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(init.headers['idempotency-key']).toBe(id(1));
    expect(init.headers['x-forwarded-for']).toBe('203.0.113.9');
    expect(isInternalDispatch(init.headers[INTERNAL_DISPATCH_HEADER])).toBe(true);
    // Only the allow-listed headers travel — never cookies.
    expect(init.headers.cookie).toBeUndefined();
  });

  it('runs one lane in order and different lanes independently', async () => {
    const { calls } = mockFetch({});
    await service.push(caller, [status(1, 't1'), comment(2, 't1'), comment(3, 't2')]);
    const t1 = calls.filter((c) => c.url.includes('/tasks/t1/')).map((c) => c.init.headers['idempotency-key']);
    expect(t1).toEqual([id(1), id(2)]);
    expect(calls).toHaveLength(3);
  });

  it('reports a replay as replayed', async () => {
    mockFetch({ 'POST /tasks/t1/comments': { status: 201, body: { data: { id: 'c1' } }, replayed: true } });
    expect((await service.push(caller, [comment(1)])).results[0].status).toBe('replayed');
  });

  it('turns a conflict into conflict with the server state', async () => {
    mockFetch({ 'PATCH /tasks/t1/status': { status: 409, body: { code: 'TASK_REASSIGNED', message: 'Given to Karim', current: { id: 't1', assignedToId: 'k' } } } });
    const [r] = (await service.push(caller, [status(1)])).results;
    expect(r).toMatchObject({ status: 'conflict', code: 'TASK_REASSIGNED', current: { assignedToId: 'k' } });
  });

  it('stops a lane on a transient failure and leaves the rest for later', async () => {
    const { calls } = mockFetch({ 'PATCH /tasks/t1/status': { status: 503 } });
    const res = await service.push(caller, [status(1), comment(2), comment(3, 't2')]);
    expect(res.results.map((r) => r.status)).toEqual(['retry', 'retry', 'applied']);
    expect(res.results[1].code).toBe('LANE_WAITING');
    expect(calls).toHaveLength(2);
  });

  it('keeps a lane going after a refusal, but skips what depended on it', async () => {
    mockFetch({ 'PATCH /tasks/t1/status': { status: 400, body: { message: 'Invalid transition' } } });
    const dependent = comment(2, 't1', { dependsOn: [id(1)] });
    const unrelated = comment(3, 't1');
    const res = await service.push(caller, [status(1), dependent, unrelated]);
    expect(res.results.map((r) => r.status)).toEqual(['rejected', 'skipped', 'applied']);
  });

  it('treats the network failing as retry, and 409 in progress as retry', async () => {
    mockFetch({ 'POST /tasks/t1/comments': [new Error('ECONNRESET'), { status: 409, body: { code: 'IDEMPOTENCY_IN_PROGRESS' } }] });
    expect((await service.push(caller, [comment(1)])).results[0].status).toBe('retry');
    expect((await service.push(caller, [comment(1)])).results[0].status).toBe('retry');
  });

  it('refuses a path parameter that could steer the request elsewhere, without calling anything', async () => {
    const { fn } = mockFetch({});
    const evil: SyncOperation = { id: id(1), op: 'task.comment', lane: 'task:t1', payload: { params: { taskId: '../users/me' }, body: {} } };
    const extra: SyncOperation = { id: id(2), op: 'task.comment', lane: 'task:t1', payload: { params: { taskId: 't1', userId: 'x' }, body: {} } };
    const unknown: SyncOperation = { id: id(3), op: 'users.delete', lane: 'task:t1', payload: {} };
    const res = await service.push(caller, [evil, extra, unknown]);
    expect(res.results.map((r) => r.code)).toEqual(['INVALID_PARAMS', 'INVALID_PARAMS', 'UNKNOWN_OPERATION']);
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects a duplicated id inside one batch', async () => {
    mockFetch({});
    const res = await service.push(caller, [comment(1), comment(1)]);
    expect(res.results.map((r) => r.status)).toEqual(['applied', 'rejected']);
  });
});

describe('internal dispatch secret', () => {
  it('matches only itself', () => {
    expect(isInternalDispatch(internalDispatchSecret())).toBe(true);
    expect(isInternalDispatch('x'.repeat(64))).toBe(false);
    expect(isInternalDispatch(undefined)).toBe(false);
    expect(isInternalDispatch(['a'])).toBe(false);
  });
});
