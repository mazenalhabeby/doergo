/**
 * The phone as a PLUG-IN of the shared request core.
 *
 * The pipeline itself (retries, the 401 → refresh → retry loop, GET merging,
 * the envelope) is the shared core's and is tested there. What is tested here
 * is what the phone plugs in — and that each piece arrives at the behaviour the
 * phone had before it moved onto the core:
 *
 *   - the refresh, mapped from the phone's tri-state; the session ends ONLY when
 *     the server refused it;
 *   - who is asking (the token's owner) keys the GET merge;
 *   - the offline answers: the endpoint's `keep`, read only when nothing answered;
 *   - the connectivity monitor and the server clock;
 *   - the phone's sentences, its headers, and a proxy's error page read as "no network";
 *   - the outbox, replaying a queued clock-in through the client;
 *   - the address picker's geocoding, now carrying the member's token.
 */
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const secure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => secure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void secure.set(k, v),
  deleteItemAsync: async (k: string) => void secure.delete(k),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afu',
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.8', hostUri: undefined } } }));

import * as fs from 'fs';
import * as path from 'path';
import { ApiError, E, api, call, clearTokens, observeResponses, saveTokens, setAuthFailureCallback, type ResponseObservation } from '../client';
import { setResponseCache } from '../response-cache';
import { httpSyncTransport } from '../../../offline/http-transport';
import { SyncEngine } from '../../../offline/sync-engine';
import { MemoryOutboxStore } from '../../../offline/outbox/memory-store';
import { readSource } from '../../../test-utils/read-source';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (sub: string, n = 0) => `${b64url({ alg: 'HS256' })}.${b64url({ sub, n })}.sig`;

type Res = { ok: boolean; status: number; headers: { get: (n: string) => string | null }; text: () => Promise<string> };
const res = (status: number, body?: unknown, opts: { raw?: string; headers?: Record<string, string> } = {}): Res => {
  const text = opts.raw ?? (body === undefined ? '' : JSON.stringify(body));
  const h = Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return { ok: status >= 200 && status < 300, status, headers: { get: (n: string) => h[n.toLowerCase()] ?? null }, text: async () => text };
};
const dead = () => Promise.reject(new TypeError('Network request failed'));

let fetchMock: jest.Mock;
let failures = 0;
let seen: ResponseObservation[] = [];
let stopObserving: () => void = () => undefined;

/** What one fetch call carried. */
const sent = (n: number) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, { method: string; headers: Record<string, string>; body?: string }];
  return { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
};

beforeEach(async () => {
  secure.clear();
  failures = 0;
  seen = [];
  setAuthFailureCallback(() => {
    failures++;
  });
  fetchMock = jest.fn();
  (global as { fetch?: unknown }).fetch = fetchMock;
  setResponseCache(null);
  stopObserving = observeResponses((o) => void seen.push(o));
  await clearTokens();
});
afterEach(() => stopObserving());

describe('the refresh: the phone\'s tri-state, through the core', () => {
  it('refreshed → the request is asked again with the NEW token, once', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const next = jwt('mike', 1);
    fetchMock
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce(res(200, { success: true, data: { accessToken: next, refreshToken: 'r2' } }))
      .mockResolvedValueOnce(res(200, { success: true, data: { ok: 1 } }));
    expect(await call(E.tasks.get, { id: 't1' })).toEqual({ ok: 1 });
    expect(sent(1).url).toMatch(/\/auth\/refresh$/);
    expect(sent(1).body).toEqual({ refreshToken: 'r1' });
    // The refresh is public: it never carries the token it is replacing.
    expect(sent(1).headers.Authorization).toBeUndefined();
    expect(sent(2).headers.Authorization).toBe(`Bearer ${next}`);
    expect(failures).toBe(0);
  });

  it('concurrent 401s share ONE refresh', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const next = jwt('mike', 1);
    fetchMock.mockImplementation(async (url: string, init: { headers: Record<string, string> }) => {
      if (url.endsWith('/auth/refresh')) return res(200, { success: true, data: { accessToken: next, refreshToken: 'r2' } });
      return init.headers.Authorization === `Bearer ${next}` ? res(200, { success: true, data: url }) : res(401);
    });
    await Promise.all([api.post('/a'), api.post('/b'), api.post('/c')]);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('unreachable (a 502 during a deploy) keeps the session: no sign-out, a network failure', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(502, undefined, { raw: '<html>Bad Gateway</html>' }));
    const err = (await api.post('/tasks').catch((e: unknown) => e)) as ApiError;
    expect(err).toMatchObject({ statusCode: 0, kind: 'network', code: 'SESSION_UNREACHABLE' });
    expect(failures).toBe(0);
    expect(secure.get('hbcfield_refresh_token')).toBe('r1');
  });

  it('invalid ends the session ONCE, clears the tokens, and says "Session expired"', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(401, { message: 'Invalid token' })).mockResolvedValueOnce(res(401, { message: 'Invalid refresh token' }));
    const err = (await call(E.tasks.get, { id: 't1' }).catch((e: unknown) => e)) as ApiError;
    expect(err).toMatchObject({ statusCode: 401, message: 'Session expired' });
    expect(failures).toBe(1);
    expect(secure.has('hbcfield_refresh_token')).toBe(false);
  });

  it('a 401 on sign-in is a wrong password — no refresh, no sign-out, the old sentence', async () => {
    fetchMock.mockResolvedValueOnce(res(401, { message: 'Invalid credentials' }));
    const err = (await call(E.auth.login, undefined, { body: { email: 'a@b.c', password: 'x', client: 'mobile' } }).catch((e: unknown) => e)) as ApiError;
    expect(err).toMatchObject({ statusCode: 401, message: 'Authentication failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent(0).headers.Authorization).toBeUndefined();
    expect(failures).toBe(0);
  });
});

describe('who is asking keys the GET merge', () => {
  it('one member asking twice is one request; the next member never gets it', async () => {
    await saveTokens(jwt('mike'), 'r1');
    let release!: (r: Res) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Res>((r) => (release = r)));
    const a = call(E.documents.list, undefined);
    const b = call(E.documents.list, undefined);
    await new Promise((r) => setTimeout(r, 0));
    await clearTokens();
    await saveTokens(jwt('karim'), 'r2');
    fetchMock.mockResolvedValueOnce(res(200, { success: true, data: ['karim'] }));
    const c = call(E.documents.list, undefined);
    release(res(200, { success: true, data: ['mike'] }));
    expect(await a).toEqual(['mike']);
    expect(await b).toEqual(['mike']);
    expect(await c).toEqual(['karim']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('offline answers: the endpoint decides, and only "nothing answered" reads them', () => {
  const store = () => {
    const map = new Map<string, unknown>();
    setResponseCache({ get: async (k) => map.get(k), put: async (k, v) => void map.set(k, v) });
    return map;
  };

  it('a kept read answers from the phone when there is no network', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const map = store();
    fetchMock.mockResolvedValueOnce(res(200, { success: true, data: [{ id: 'd1' }] }));
    await call(E.documents.list, undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(map.get('/documents')).toEqual([{ id: 'd1' }]);
    fetchMock.mockImplementation(dead);
    expect(await call(E.documents.list, undefined)).toEqual([{ id: 'd1' }]);
  });

  it('a proxy\'s error page while the gateway restarts is "no network" too — the kept answer shows', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const map = store();
    map.set('/documents', [{ id: 'd1' }]);
    fetchMock.mockResolvedValue(res(502, undefined, { raw: '<html>502 Bad Gateway</html>' }));
    expect(await call(E.documents.list, undefined)).toEqual([{ id: 'd1' }]);
  });

  it('a refusal from the server is never masked by a kept answer', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const map = store();
    map.set('/documents', [{ id: 'd1' }]);
    fetchMock.mockResolvedValue(res(403, { statusCode: 403, message: 'No' }));
    await expect(call(E.documents.list, undefined)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('presence and the shift are never stored, never answered', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const map = store();
    fetchMock.mockResolvedValue(res(200, { success: true, data: [{ id: 'x' }] }));
    await call(E.attendance.status);
    await call(E.attendance.allEntries, { status: 'CLOCKED_IN', limit: 300 });
    await call(E.rota.week, { spaceId: 's1' });
    await new Promise((r) => setTimeout(r, 0));
    expect([...map.keys()]).toEqual([]);
    map.set('/attendance/status', { stale: true });
    fetchMock.mockImplementation(dead);
    await expect(call(E.attendance.status)).rejects.toMatchObject({ statusCode: 0, code: 'NETWORK' });
  });

  it('a list asked WITH its total is never answered from the phone', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const map = store();
    map.set('/employees?page=1', [{ id: 'old' }]);
    fetchMock.mockImplementation(dead);
    await expect(api.page('/employees?page=1')).rejects.toMatchObject({ statusCode: 0 });
  });
});

describe('the connectivity monitor and the server clock', () => {
  it('every answer reports the network working, with the server\'s time', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(404, { message: 'nope' }, { headers: { 'X-Server-Time': '2026-10-10T09:00:00.000Z' } }));
    await call(E.tasks.get, { id: 'gone' }).catch(() => undefined);
    expect(seen).toEqual([{ kind: 'response', status: 404, serverTime: '2026-10-10T09:00:00.000Z' }]);
  });

  it('nothing answering is reported once — after the one retry a read gets', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockImplementation(dead);
    await call(E.tasks.get, { id: 't' }).catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([{ kind: 'network-error' }]);
  });
});

describe('what a failure says, and what every request carries', () => {
  it('no network and too slow are the phone\'s own sentences (English before i18n starts)', async () => {
    fetchMock.mockImplementation(dead);
    const offline = (await api.post('/x').catch((e: unknown) => e)) as ApiError;
    expect(offline.message).toMatch(/offline/i);
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const slow = (await api.post('/x', undefined, { timeoutMs: 10 }).catch((e: unknown) => e)) as ApiError;
    expect(slow).toMatchObject({ statusCode: 0, code: 'TIMEOUT' });
    expect(slow.message).toMatch(/weak|signal/i);
  });

  it('a 429 reads as it always has', async () => {
    fetchMock.mockResolvedValue(res(429, { message: 'ThrottlerException: Too Many Requests' }));
    const err = (await api.post('/x', undefined, { retry: false }).catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe('Too many requests. Please wait.');
  });

  it('the build and the platform ride on every request', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValue(res(200, { success: true, data: null }));
    await call(E.overtime.active);
    expect(sent(0).headers).toMatchObject({ 'X-Client-Platform': 'mobile', 'X-App-Version': '1.0.8', 'X-App-Platform': expect.stringMatching(/^(ios|android)$/) });
    expect(sent(0).url).toBe('https://hbcfield.com/api/v1/overtime/active');
  });
});

describe('the address picker\'s geocoding goes through the client WITH the member\'s token', () => {
  it('search, reverse and place carry the bearer and an encoded query', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValue(res(200, { results: [{ id: 'g1', label: 'Wien' }] }));
    expect(await call(E.geo.search, { q: 'Wien & Co', limit: 6, session: 's-1' })).toEqual({ results: [{ id: 'g1', label: 'Wien' }] });
    await call(E.geo.reverse, { lat: 48.2, lon: 16.37 });
    await call(E.geo.place, { id: 'g1', session: 's-1' });
    expect(sent(0).url).toBe('https://hbcfield.com/api/v1/geo/search?q=Wien+%26+Co&limit=6&session=s-1');
    expect(sent(1).url).toBe('https://hbcfield.com/api/v1/geo/reverse?lat=48.2&lon=16.37');
    expect(sent(2).url).toBe('https://hbcfield.com/api/v1/geo/place?id=g1&session=s-1');
    for (const n of [0, 1, 2]) expect(sent(n).headers.Authorization).toBe(`Bearer ${jwt('mike')}`);
  });

  it('the picker itself asks through the endpoints, not a URL of its own', () => {
    const src = readSource(path.resolve(__dirname, '../../../components/location-search-picker.tsx'), 'utf8');
    expect(src).toMatch(/call\(E\.geo\.search,/);
    expect(src).toMatch(/call\(E\.geo\.reverse,/);
    expect(src).toMatch(/call\(E\.geo\.place,/);
    expect(src).not.toMatch(/API_URL/);
  });
});

describe('the outbox replays through the client', () => {
  let t = 1_757_849_000_000;
  let n = 0;
  const newId = () => `0190f3c2-7b1a-7c3d-9e4f-${String(++n).padStart(12, '0')}`;
  const engine = () => {
    const store = new MemoryOutboxStore();
    const e = new SyncEngine({
      userId: 'mike', organizationId: 'o1', store, transport: httpSyncTransport,
      records: { applyPull: async () => undefined, cursor: async () => ({ cursor: null, lastPullAt: null }) },
      newId, now: () => t, random: () => 0.5,
    });
    return { e, store };
  };
  const clockIn = { op: 'attendance.clockIn' as const, lane: 'shift:e1', entityId: 'e1', payload: { body: { id: 'e1', locationId: 'loc-1' } } };
  const pushes = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/sync/push'));
  const settle = async (e: SyncEngine) => {
    await e.flush();
    await new Promise((r) => setTimeout(r, 0));
    await e.flush();
  };

  it('a clock-in queued with no signal lands ONCE: one push per flush, the same id each time', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const { e, store } = engine();
    fetchMock.mockImplementation(dead);
    const op = await e.enqueue(clockIn);
    await settle(e);
    // A write is never retried in-band: one attempt per flush, as before.
    expect(pushes()).toHaveLength(1);
    expect(await store.get(op.id)).toMatchObject({ state: 'retry', lastError: { code: 'NO_CONNECTION' } });

    t += 10 * 60_000;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(res(200, { success: true, data: { results: [{ id: op.id, status: 'applied', body: { id: 'e1' } }] } }));
    await settle(e);
    expect(pushes()).toHaveLength(1);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    // The operation id is the idempotency key the server replays a resend by.
    expect(body.operations.map((o: { id: string; op: string }) => [o.id, o.op])).toEqual([[op.id, 'attendance.clockIn']]);
    expect((fetchMock.mock.calls[0]![1] as { headers: Record<string, string> }).headers.Authorization).toBe(`Bearer ${jwt('mike')}`);
    expect(await store.get(op.id)).toMatchObject({ state: 'done' });

    await settle(e);
    expect(pushes()).toHaveLength(1);
    e.stop();
  });

  it('refusals are classified exactly as before', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const op = (id: string) => ({ id, op: 'attendance.clockIn', lane: 'l', dependsOn: [], payload: { body: {} } }) as never;

    fetchMock.mockResolvedValueOnce(res(409, { statusCode: 409, message: 'busy', code: 'IDEMPOTENCY_IN_PROGRESS' }));
    expect(await httpSyncTransport.push([op('a')])).toEqual({ ok: false, status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' });

    fetchMock.mockResolvedValueOnce(res(400, { statusCode: 400, message: 'bad', code: 'VALIDATION' }));
    expect(await httpSyncTransport.push([op('b')])).toEqual({ ok: false, status: 400, code: 'VALIDATION' });

    // A 429 is handed to the outbox's own backoff — not retried in the client.
    fetchMock.mockResolvedValueOnce(res(429, { statusCode: 429, message: 'slow down' }));
    expect(await httpSyncTransport.push([op('c')])).toEqual({ ok: false, status: 429, code: undefined });
    expect(pushes()).toHaveLength(3);

    fetchMock.mockImplementationOnce(dead);
    expect(await httpSyncTransport.push([op('d')])).toEqual({ ok: false, status: null, code: 'NO_CONNECTION' });

    // The refresh found no server: the session is kept, and the push waits like no signal.
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(503));
    expect(await httpSyncTransport.push([op('e')])).toEqual({ ok: false, status: null, code: 'SESSION_UNREACHABLE' });

    // The server refused the session: 401, which the outbox reads as "waiting for sign-in".
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(401));
    expect(await httpSyncTransport.push([op('f')])).toMatchObject({ ok: false, status: 401 });
  });

  it('a push that timed out is "slow", status 408 — the outbox history reads as it always has', async () => {
    jest.useFakeTimers();
    try {
      await saveTokens(jwt('mike'), 'r1');
      fetchMock.mockImplementation(() => new Promise(() => undefined));
      const pending = httpSyncTransport.push([{ id: 'g', op: 'attendance.clockIn', lane: 'l', dependsOn: [], payload: { body: {} } } as never]);
      await jest.advanceTimersByTimeAsync(15_001);
      expect(await pending).toEqual({ ok: false, status: 408, code: 'SLOW_CONNECTION' });
    } finally {
      jest.useRealTimers();
    }
  });
});
