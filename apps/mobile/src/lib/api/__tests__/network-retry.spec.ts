/**
 * The first request after the app is reopened must not be the last word.
 *
 * Closing the app and opening it again showed "You're offline. This will load
 * when you're back online." on a phone with full signal — and the Retry button
 * worked every time, which is the whole diagnosis: the process was killed, the
 * connection pool it left behind was stale, and the ONE request that inherited
 * it failed. Nothing in the client tried again, so a blip lasting a few
 * hundred milliseconds became a full-screen error until the member tapped.
 *
 * A read is retried once. A WRITE is not, and that is the load-bearing half:
 * nothing here carries an idempotency key, so a blind second POST is a second
 * clock-in. Writes that must survive no signal go through the outbox.
 */
// The bundler defines this; a plain ts-jest run does not.
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => 'access-token',
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.6', hostUri: undefined } },
}));

import { api, observeResponses, type ResponseObservation } from '../client';

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => JSON.stringify({ data: body }),
});

/** What React Native throws when nothing answered. */
const dead = () => Promise.reject(new TypeError('Network request failed'));

let seen: ResponseObservation[] = [];
let stopObserving: () => void;

beforeEach(() => {
  seen = [];
  stopObserving = observeResponses((o) => void seen.push(o));
});
afterEach(() => stopObserving());

describe('a request that never reached the server', () => {
  it('is tried once more, and the member is told nothing', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(dead)
      .mockImplementationOnce(async () => ok([{ id: 'task-1' }]));
    (global as { fetch?: unknown }).fetch = fetchMock;

    await expect(api.get('/tasks?retry-succeeds')).resolves.toEqual([{ id: 'task-1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Two failures in a row is what the connectivity monitor calls a weak
    // connection. A blip the retry survived must not count as one.
    expect(seen.filter((o) => o.kind === 'network-error')).toHaveLength(0);
  });

  it('still gives up when the second try fails too', async () => {
    const fetchMock = jest.fn().mockImplementation(dead);
    (global as { fetch?: unknown }).fetch = fetchMock;

    await expect(api.get('/tasks?retry-fails')).rejects.toMatchObject({ statusCode: 0, code: 'NETWORK' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Reported once, not twice: one outage, one observation.
    expect(seen.filter((o) => o.kind === 'network-error')).toHaveLength(1);
  });

  it('a write is retried once, under the SAME Idempotency-Key (the server runs it once)', async () => {
    const fetchMock = jest.fn().mockImplementation(dead);
    (global as { fetch?: unknown }).fetch = fetchMock;

    await expect(api.post('/attendance/clock-in', {})).rejects.toMatchObject({ statusCode: 0, code: 'NETWORK' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map(([, init]) => init.headers['Idempotency-Key']);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it('a write without its key is still never sent twice', async () => {
    const fetchMock = jest.fn().mockImplementation(dead);
    (global as { fetch?: unknown }).fetch = fetchMock;

    await expect(api.post('/attendance/clock-in', {}, { idempotencyKey: false })).rejects.toMatchObject({ code: 'NETWORK' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a request that timed out — the 15s was the answer', async () => {
    // Nothing ever answers; the per-attempt timer (15 s in the app, 20 ms here) is what ends it.
    const fetchMock = jest.fn().mockImplementation(() => new Promise(() => undefined));
    (global as { fetch?: unknown }).fetch = fetchMock;

    // ⚠️ Was 408 / SLOW_CONNECTION; the shared core says status 0 / TIMEOUT.
    await expect(api.get('/tasks?slow', { timeoutMs: 20 })).rejects.toMatchObject({ statusCode: 0, code: 'TIMEOUT', kind: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A slow line is not "offline": the connectivity monitor is not told.
    expect(seen.filter((o) => o.kind === 'network-error')).toHaveLength(0);
  });
});
