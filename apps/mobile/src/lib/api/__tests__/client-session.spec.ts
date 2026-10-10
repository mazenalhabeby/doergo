/**
 * The API client's half of a session: refresh, the envelope, refusals, and the
 * merged GETs.
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

import {
  ApiError,
  clearTokens,
  fetchPageWithAuth,
  fetchWithAuth,
  refreshRefusedSession,
  refreshSession,
  saveTokens,
  sessionOwnerId,
  sessionStartedAt,
  setAuthFailureCallback,
} from '../client';
import { envelopeMeta, isEnvelope, readBody, refusalDetails, unwrapEnvelope } from '../envelope';
import { jwtSubject } from '../session-owner';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (sub: string) => `${b64url({ alg: 'HS256' })}.${b64url({ sub, email: `${sub}@x` })}.sig`;

type Res = { ok: boolean; status: number; headers: { get: () => null }; text: () => Promise<string>; json: () => Promise<unknown> };
const res = (status: number, body?: unknown, raw?: string): Res => {
  const text = raw ?? (body === undefined ? '' : JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) };
};

let fetchMock: jest.Mock;
let failures = 0;
beforeEach(async () => {
  secure.clear();
  failures = 0;
  setAuthFailureCallback(() => { failures++; });
  fetchMock = jest.fn();
  (global as { fetch?: unknown }).fetch = fetchMock;
  await clearTokens();
});

describe('the session owner is read from the token', () => {
  it('decodes `sub`, and nothing from a non-JWT', () => {
    expect(jwtSubject(jwt('mike'))).toBe('mike');
    expect(jwtSubject('access-token')).toBeNull();
    expect(jwtSubject('a.!!!.c')).toBeNull();
    expect(jwtSubject(null)).toBeNull();
  });

  it('sessionOwnerId follows the stored tokens', async () => {
    await saveTokens(jwt('mike'), 'r1');
    expect(await sessionOwnerId()).toBe('mike');
    await clearTokens();
    expect(await sessionOwnerId()).toBeNull();
  });

  it('a session start is recorded for a new member and kept across a refresh', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const start = await sessionStartedAt();
    expect(typeof start).toBe('number');
    await saveTokens(jwt('mike'), 'r2');
    expect(await sessionStartedAt()).toBe(start);
    await saveTokens(jwt('karim'), 'r3');
    expect(await sessionStartedAt()).toBeGreaterThanOrEqual(start!);
  });
});

describe('refresh: only the server refusing ends a session', () => {
  it.each([400, 401, 403])('%i from /auth/refresh is "invalid": tokens cleared', async (status) => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(status, { message: 'no' }));
    expect(await refreshSession()).toEqual({ kind: 'invalid' });
    expect(secure.has('hbcfield_refresh_token')).toBe(false);
  });

  it.each([429, 500, 502, 503])('%i is "unreachable": tokens kept', async (status) => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(status, undefined, '<html>busy</html>'));
    expect(await refreshSession()).toEqual({ kind: 'unreachable' });
    expect(secure.get('hbcfield_refresh_token')).toBe('r1');
  });

  it('no network, and a 200 that cannot be read, are "unreachable" too', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await refreshSession()).toEqual({ kind: 'unreachable' });
    fetchMock.mockResolvedValueOnce(res(200, undefined, 'not json'));
    expect(await refreshSession()).toEqual({ kind: 'unreachable' });
    fetchMock.mockResolvedValueOnce(res(200, { success: true, data: { accessToken: 'x' } }));
    expect(await refreshSession()).toEqual({ kind: 'unreachable' });
    expect(secure.get('hbcfield_refresh_token')).toBe('r1');
  });

  it('a good answer stores the new pair', async () => {
    await saveTokens(jwt('mike'), 'r1');
    const next = jwt('mike');
    fetchMock.mockResolvedValueOnce(res(200, { success: true, data: { accessToken: next, refreshToken: 'r2' } }));
    expect(await refreshSession()).toEqual({ kind: 'refreshed', accessToken: next });
    expect(secure.get('hbcfield_refresh_token')).toBe('r2');
  });

  it('the rule itself', () => {
    expect([400, 401, 403].every(refreshRefusedSession)).toBe(true);
    expect([0, 404, 408, 429, 500, 502].some(refreshRefusedSession)).toBe(false);
  });
});

describe('a 401 on a request', () => {
  it('with the refresh unreachable: a retryable error, nobody signed out', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(401, { message: 'expired' })).mockResolvedValueOnce(res(503));
    const err = (await fetchWithAuth('/tasks', { method: 'POST' }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(0);
    expect(err.code).toBe('SESSION_UNREACHABLE');
    expect(failures).toBe(0);
    expect(secure.get('hbcfield_refresh_token')).toBe('r1');
  });

  it('with the refresh refused: the session ends', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(401));
    const err = (await fetchWithAuth('/tasks', { method: 'POST' }).catch((e: unknown) => e)) as ApiError;
    expect(err.statusCode).toBe(401);
    expect(failures).toBe(1);
  });
});

describe('the envelope is taken off by shape', () => {
  it('{ success, data: null } is null — not the envelope', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(200, { success: true, data: null }));
    expect(await fetchWithAuth('/tasks/t1/report?a')).toBeNull();
  });

  it('a bare { data } is unwrapped, so is the older pass-through { data, hasMore }', () => {
    expect(unwrapEnvelope({ data: { code: 'X' } })).toEqual({ code: 'X' });
    expect(unwrapEnvelope({ data: [1], hasMore: true })).toEqual([1]);
    expect(unwrapEnvelope({ data: null, hasMore: false })).toBeNull();
    // A null `data` beside keys no envelope has is an answer, returned whole.
    expect(unwrapEnvelope({ id: 'n1', data: null })).toEqual({ id: 'n1', data: null });
    expect(unwrapEnvelope({ success: true })).toEqual({ success: true });
    expect(unwrapEnvelope([1, 2])).toEqual([1, 2]);
    expect(isEnvelope({ success: false, data: null })).toBe(true);
  });

  it('meta comes back with fetchPageWithAuth', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(200, { success: true, data: [{ id: 1 }], meta: { total: 41, page: 1 } }));
    expect(await fetchPageWithAuth('/employees?page=1')).toEqual({ data: [{ id: 1 }], meta: { total: 41, page: 1 } });
    expect(envelopeMeta({ success: true, data: [] })).toBeNull();
  });

  it('204 and an empty body are null — never "no connection"', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(204));
    await expect(fetchWithAuth('/sync/telemetry', { method: 'POST' })).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(res(200, undefined, ''));
    await expect(fetchWithAuth('/x', { method: 'POST' })).resolves.toBeNull();
    expect(await readBody({ status: 204, json: async () => { throw new Error('no body'); } })).toBeNull();
  });
});

describe('a refusal carries the server\'s code and params', () => {
  it('ApiError.params is what the translated sentence is filled from', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValueOnce(res(400, { statusCode: 400, message: 'Too far', code: 'TOO_FAR_TO_START', params: { distanceMetres: 9631000, radiusMetres: 100 } }));
    const err = (await fetchWithAuth('/tasks/t/status', { method: 'PATCH' }).catch((e: unknown) => e)) as ApiError;
    expect(err).toMatchObject({ statusCode: 400, code: 'TOO_FAR_TO_START', params: { distanceMetres: 9631000, radiusMetres: 100 }, message: 'Too far' });
  });

  it('also read from a nested error object', () => {
    expect(refusalDetails({ error: { code: 'X', params: { a: 1 } } })).toEqual({ code: 'X', params: { a: 1 } });
    expect(refusalDetails('nope')).toEqual({});
  });
});

describe('merged GETs belong to one person', () => {
  it('a GET in flight for one member is never handed to the next', async () => {
    await saveTokens(jwt('mike'), 'r1');
    let release!: (r: Res) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Res>((r) => { release = r; }));
    const mikes = fetchWithAuth('/attendance/status?merge');
    await new Promise((r) => setTimeout(r, 0));

    await clearTokens();
    await saveTokens(jwt('karim'), 'r2');
    fetchMock.mockResolvedValueOnce(res(200, { success: true, data: { who: 'karim' } }));
    const karims = fetchWithAuth('/attendance/status?merge');
    release(res(200, { success: true, data: { who: 'mike' } }));

    expect(await karims).toEqual({ who: 'karim' });
    expect(await mikes).toEqual({ who: 'mike' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('two asks by the same member still share one request', async () => {
    await saveTokens(jwt('mike'), 'r1');
    fetchMock.mockResolvedValue(res(200, { success: true, data: [1] }));
    await Promise.all([fetchWithAuth('/same?x'), fetchWithAuth('/same?x')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('after the session has ended', () => {
  it('a request that carried no token is refused without ending the session again', async () => {
    fetchMock.mockResolvedValueOnce(res(401));
    const err = (await fetchWithAuth('/home?late', { method: 'POST' }).catch((e: unknown) => e)) as ApiError;
    expect(err.statusCode).toBe(401);
    expect(failures).toBe(0);
  });
});
