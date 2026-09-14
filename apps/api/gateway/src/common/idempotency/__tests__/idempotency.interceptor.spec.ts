import { lastValueFrom, of, throwError } from 'rxjs';
import { IdempotencyInterceptor, requestHash, stableStringify } from '../idempotency.interceptor';
import type { IdempotencyEntry } from '../idempotency.store';

/** An in-memory store with the Redis semantics that matter: NX claim, TTL-free. */
function memoryStore(opts: { down?: boolean } = {}) {
  const map = new Map<string, IdempotencyEntry>();
  return {
    map,
    claim: jest.fn(async (u: string, k: string, hash: string) => {
      if (opts.down) return { unavailable: true as const };
      const id = `${u}:${k}`;
      const entry = map.get(id);
      if (entry) return { claimed: false as const, entry };
      map.set(id, { state: 'running', hash });
      return { claimed: true as const };
    }),
    complete: jest.fn(async (u: string, k: string, e: IdempotencyEntry) => void map.set(`${u}:${k}`, e)),
    release: jest.fn(async (u: string, k: string) => void map.delete(`${u}:${k}`)),
  };
}

function ctx(over: { method?: string; url?: string; body?: unknown; key?: string; userId?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (over.key !== undefined) headers['idempotency-key'] = over.key;
  const req = {
    method: over.method ?? 'POST',
    originalUrl: over.url ?? '/api/v1/tasks/t1/comments',
    body: over.body ?? { content: 'Pump replaced' },
    headers,
    user: over.userId === null ? undefined : { id: over.userId ?? 'u1' },
  };
  const res = { statusCode: 201, headers: {} as Record<string, string>, status(c: number) { this.statusCode = c; return this; }, setHeader(k: string, v: string) { this.headers[k] = v; } };
  return {
    res,
    context: { getType: () => 'http', switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any,
  };
}

const KEY = '0190f3c2-7b1a-7c3d-9e4f-5a6b7c8d9e0f';
const flush = () => new Promise((r) => setImmediate(r));

describe('IdempotencyInterceptor', () => {
  it('runs a request once and replays the stored answer on retry', async () => {
    const store = memoryStore();
    const interceptor = new IdempotencyInterceptor(store as any);
    const handler = jest.fn(() => of({ id: 'c1' }));

    const first = ctx({ key: KEY });
    await expect(lastValueFrom(interceptor.intercept(first.context, { handle: handler }))).resolves.toEqual({ id: 'c1' });
    await flush();

    const retry = ctx({ key: KEY });
    await expect(lastValueFrom(interceptor.intercept(retry.context, { handle: handler }))).resolves.toEqual({ id: 'c1' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(retry.res.statusCode).toBe(201);
    expect(retry.res.headers['Idempotent-Replayed']).toBe('true');
  });

  it('refuses the same key for a different request', async () => {
    const store = memoryStore();
    const interceptor = new IdempotencyInterceptor(store as any);
    await lastValueFrom(interceptor.intercept(ctx({ key: KEY }).context, { handle: () => of({}) }));
    await flush();
    const other = ctx({ key: KEY, body: { content: 'Something else' } });
    await expect(lastValueFrom(interceptor.intercept(other.context, { handle: () => of({}) }))).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
  });

  it('answers 409 while the first attempt is still running', async () => {
    const store = memoryStore();
    store.map.set(`u1:${KEY}`, { state: 'running', hash: requestHash('POST', '/api/v1/tasks/t1/comments', { content: 'Pump replaced' }) });
    const interceptor = new IdempotencyInterceptor(store as any);
    await expect(lastValueFrom(interceptor.intercept(ctx({ key: KEY }).context, { handle: () => of({}) }))).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_IN_PROGRESS' },
    });
  });

  it('forgets a failed attempt so the retry runs again', async () => {
    const store = memoryStore();
    const interceptor = new IdempotencyInterceptor(store as any);
    await expect(
      lastValueFrom(interceptor.intercept(ctx({ key: KEY }).context, { handle: () => throwError(() => new Error('db down')) })),
    ).rejects.toThrow('db down');
    await flush();
    const handler = jest.fn(() => of({ ok: true }));
    await lastValueFrom(interceptor.intercept(ctx({ key: KEY }).context, { handle: handler }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('scopes keys to the member — another member cannot read the answer', async () => {
    const store = memoryStore();
    const interceptor = new IdempotencyInterceptor(store as any);
    await lastValueFrom(interceptor.intercept(ctx({ key: KEY, userId: 'u1' }).context, { handle: () => of({ secret: 1 }) }));
    await flush();
    const handler = jest.fn(() => of({ mine: true }));
    const res = await lastValueFrom(interceptor.intercept(ctx({ key: KEY, userId: 'u2' }).context, { handle: handler }));
    expect(res).toEqual({ mine: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a header, on reads, or without a signed-in member', async () => {
    const store = memoryStore();
    const interceptor = new IdempotencyInterceptor(store as any);
    for (const c of [ctx(), ctx({ key: KEY, method: 'GET' }), ctx({ key: KEY, userId: null })]) {
      await lastValueFrom(interceptor.intercept(c.context, { handle: () => of({}) }));
    }
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('rejects a malformed key', async () => {
    const interceptor = new IdempotencyInterceptor(memoryStore() as any);
    for (const bad of ['short', 'has spaces in it that are long', 'x'.repeat(129), 'idem:u1:key-with-colon']) {
      await expect(lastValueFrom(interceptor.intercept(ctx({ key: bad }).context, { handle: () => of({}) }))).rejects.toThrow('Idempotency-Key');
    }
  });

  it('runs without the guarantee when the store is down (fails open)', async () => {
    const interceptor = new IdempotencyInterceptor(memoryStore({ down: true }) as any);
    const handler = jest.fn(() => of({ ok: true }));
    await lastValueFrom(interceptor.intercept(ctx({ key: KEY }).context, { handle: handler }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not remember an oversized answer', async () => {
    const store = memoryStore();
    const interceptor = new IdempotencyInterceptor(store as any);
    await lastValueFrom(interceptor.intercept(ctx({ key: KEY }).context, { handle: () => of({ blob: 'x'.repeat(300 * 1024) }) }));
    await flush();
    expect(store.release).toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });
});

describe('requestHash', () => {
  it('ignores key order and undefined fields', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe(stableStringify({ a: [2, { d: 3 }], b: 1 }));
    expect(requestHash('post', '/x', { a: 1, b: 2 })).toBe(requestHash('POST', '/x', { b: 2, a: 1 }));
  });
  it('differs by path and body', () => {
    expect(requestHash('POST', '/x', {})).not.toBe(requestHash('POST', '/y', {}));
    expect(requestHash('POST', '/x', { a: 1 })).not.toBe(requestHash('POST', '/x', { a: 2 }));
  });
});
