/**
 * The console's plug-in of the shared request pipeline: what a 401 means here,
 * the 2FA-enrolment refusal, the fetch options, the cursor pages, cancelling —
 * and that the console's route table can only ever build a relative, encoded
 * path.
 */
import { createApiClient, platformEndpoints } from '@hbcfield/shared/client';
import {
  API_BASE,
  ENROLMENT_REQUIRED_CODE,
  ENROLMENT_REQUIRED_EVENT,
  REQUEST_TIMEOUT_MS,
  SESSION_EXPIRED_EVENT,
  api,
  clearToken,
  consoleClientConfig,
  getToken,
  isAbort,
  setToken,
} from '../client';
import { auditApi, authApi, orgsApi } from '../endpoints';

// ── A window of our own: events + sessionStorage ──────────────────────────────
const store = new Map<string, string>();
const win = Object.assign(new EventTarget(), {
  sessionStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});
(globalThis as unknown as { window: unknown }).window = win;

function heard(name: string): () => number {
  let n = 0;
  win.addEventListener(name, () => n++);
  return () => n;
}

interface Seen {
  url: string;
  init: { method?: string; headers?: Record<string, string>; body?: unknown; credentials?: string; cache?: string };
}
let seen: Seen[] = [];

function answer(status: number, body: unknown) {
  const text = body === undefined ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null, forEach: () => undefined },
    text: async () => text,
  };
}

function serve(status: number, body: unknown) {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init: Seen['init']) => {
    seen.push({ url, init });
    return answer(status, body);
  });
}

beforeEach(() => {
  seen = [];
  clearToken();
});

describe('the console client', () => {
  it('is the shared core with the console config', () => {
    const c = consoleClientConfig();
    expect(c.baseUrl()).toBe(API_BASE);
    expect(c.refresh).toBeUndefined();
    expect(c.credentials).toBe('omit');
    expect(c.fetchCache).toBe('no-store');
    expect(c.timeoutMs).toBe(REQUEST_TIMEOUT_MS);
    expect(REQUEST_TIMEOUT_MS).toBe(20_000);
  });

  it('sends the token, no cookie, no cache, to the API base', async () => {
    setToken('t-1');
    serve(200, { success: true, data: { totalOrgs: 3 } });
    await expect(orgsApi.overview()).resolves.toEqual({ totalOrgs: 3 });
    expect(seen[0].url).toBe(`${API_BASE}/platform/overview`);
    expect(seen[0].init.headers?.Authorization).toBe('Bearer t-1');
    expect(seen[0].init.credentials).toBe('omit');
    expect(seen[0].init.cache).toBe('no-store');
  });

  it('a 401 on a session call ends the session everywhere', async () => {
    const expired = heard(SESSION_EXPIRED_EVENT);
    setToken('stale');
    serve(401, { statusCode: 401, message: 'Unauthorized' });
    await expect(orgsApi.overview()).rejects.toMatchObject({ status: 401 });
    expect(expired()).toBe(1);
    expect(getToken()).toBe('');
    expect(store.size).toBe(0);
  });

  it('a 401 at sign-in is a wrong password, not an ended session', async () => {
    const expired = heard(SESSION_EXPIRED_EVENT);
    setToken('kept');
    serve(401, { statusCode: 401, message: 'Invalid credentials' });
    await expect(authApi.login({ email: 'a@b.c', password: 'x' })).rejects.toMatchObject({ status: 401, message: 'Invalid credentials' });
    expect(expired()).toBe(0);
    expect(getToken()).toBe('kept');
    // Public: the token is not even sent.
    expect(seen[0].init.headers?.Authorization).toBeUndefined();
  });

  it('the 2FA-enrolment refusal sends the console to the enrolment screen', async () => {
    const enrol = heard(ENROLMENT_REQUIRED_EVENT);
    const expired = heard(SESSION_EXPIRED_EVENT);
    setToken('t');
    serve(403, { statusCode: 403, message: 'Enrol a second factor first', code: ENROLMENT_REQUIRED_CODE });
    await expect(orgsApi.overview()).rejects.toMatchObject({ status: 403, code: ENROLMENT_REQUIRED_CODE });
    expect(enrol()).toBe(1);
    expect(expired()).toBe(0);
    expect(getToken()).toBe('t');
  });

  it('any other 403 is only an error', async () => {
    const enrol = heard(ENROLMENT_REQUIRED_EVENT);
    setToken('t');
    serve(403, { statusCode: 403, message: 'Forbidden' });
    await expect(orgsApi.overview()).rejects.toMatchObject({ status: 403 });
    expect(enrol()).toBe(0);
  });

  it('a POST without a payload still sends {} (the server reads body?.x)', async () => {
    setToken('t');
    serve(200, { success: true, data: { ok: true } });
    await orgsApi.suspend('o/1');
    expect(seen[0].url).toBe(`${API_BASE}/platform/orgs/o%2F1/suspend`);
    expect(seen[0].init.method).toBe('POST');
    expect(seen[0].init.body).toBe('{}');
  });

  it('keeps the cursor of a cursor list', async () => {
    setToken('t');
    serve(200, { success: true, data: [{ id: 'a' }], nextCursor: 'a' });
    await expect(orgsApi.list({ search: 'acme', status: 'all', cursor: null })).resolves.toEqual({ data: [{ id: 'a' }], nextCursor: 'a' });
    expect(seen[0].url).toBe(`${API_BASE}/platform/orgs?search=acme`);
    serve(200, { success: true, data: [], nextCursor: null });
    await expect(auditApi.list({ cursor: 'x y' })).resolves.toEqual({ data: [], nextCursor: null });
    expect(seen[1].url).toBe(`${API_BASE}/platform/audit?cursor=x+y&limit=50`);
  });

  it('a cancelled search is an abort, not an error to show', async () => {
    setToken('t');
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() => new Promise(() => undefined));
    const ctrl = new AbortController();
    const p = orgsApi.list({ search: 'a' }, { signal: ctrl.signal });
    ctrl.abort();
    const e = await p.catch((err) => err);
    expect(isAbort(e)).toBe(true);
  });

  it('refuses an absolute URL — the operator token only ever goes to the API', async () => {
    setToken('t');
    serve(200, {});
    await expect(api.get('https://evil.example/x')).rejects.toThrow(TypeError);
    await expect(api.get('//evil.example/x')).rejects.toThrow(TypeError);
    expect(seen).toHaveLength(0);
  });

  it('a configured client never reaches fetch for a URL either', async () => {
    const fetch = jest.fn();
    const c = createApiClient(consoleClientConfig({ fetch }));
    await expect(c.get('http://localhost:4000/api/v1/platform/overview')).rejects.toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('the platform route table', () => {
  const HOSTILE = '../x?y=1#z&w';
  const hostileArgs = new Proxy(
    {},
    {
      get: (_t, k) => (typeof k === 'string' ? HOSTILE : undefined),
      ownKeys: () => ['extra'],
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true, value: HOSTILE }),
    },
  );
  const all = Object.entries(platformEndpoints).flatMap(([domain, defs]) =>
    Object.entries(defs).map(([key, def]) => ({ domain, key, def })),
  );

  it.each(all.map((e) => [e.def.name, e]))('%s builds a relative, encoded path', (_n, { def }) => {
    const built = def.path(hostileArgs as never);
    expect(built.startsWith('/platform/')).toBe(true);
    expect(built).not.toContain('../x');
    expect(built).not.toContain('#');
    expect(built).not.toContain('y=1');
    expect((built.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('names every route uniquely, and only sign-in is public', () => {
    const names = all.map((e) => e.def.name);
    expect(new Set(names).size).toBe(names.length);
    expect(all.filter((e) => e.def.public).map((e) => e.def.name)).toEqual(['platformAuth.login']);
  });
});
