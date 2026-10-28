/**
 * The shared HTTP core (packages/shared/src/http) — tested here because
 * packages/shared has no runner of its own; this suite imports it through the
 * browser entry exactly as the apps will.
 */
import {
  ApiError,
  apiEndpoints,
  createApiClient,
  defineEndpoints,
  endpoint,
  envelopeMeta,
  isApiError,
  path,
  queryKey,
  readBody,
  toApiError,
  toResult,
  unwrapEnvelope,
  withQuery,
  type ApiClientConfig,
  type ResponseLike,
} from '@hbcfield/shared/client'

// ── a fake network ────────────────────────────────────────────────────────────

function res(status: number, body?: unknown, headers: Record<string, string> = {}): ResponseLike {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (n: string) => h.get(n.toLowerCase()) ?? null, forEach: (cb) => h.forEach((v, k) => cb(v, k)) },
    text: async () => (body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

interface Call {
  url: string
  init: { method: string; headers: Record<string, string>; body?: unknown }
}

/** A fetch that answers from a script, recording every call. */
function scripted(answers: Array<ResponseLike | Error | ((c: Call) => ResponseLike | Error | Promise<ResponseLike>)>) {
  const calls: Call[] = []
  let i = 0
  const fetch = jest.fn(async (url: string, init: Call['init']) => {
    const c = { url, init }
    calls.push(c)
    const a = answers[Math.min(i++, answers.length - 1)]
    const out = typeof a === 'function' ? await a(c) : a
    if (out instanceof Error) throw out
    return out
  })
  return { fetch, calls }
}

function client(fetch: ApiClientConfig['fetch'], extra: Partial<ApiClientConfig> = {}) {
  const sleeps: number[] = []
  const c = createApiClient({
    baseUrl: () => 'https://api.test/api/v1',
    getToken: () => 'tok-1',
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    random: () => 0.5,
    ...extra,
  })
  return { c, sleeps }
}

const ok = (data: unknown, extra: Record<string, unknown> = {}) => res(200, { success: true, data, ...extra })

// ── envelope ──────────────────────────────────────────────────────────────────

describe('envelope', () => {
  it('unwraps the API envelope by shape', () => {
    expect(unwrapEnvelope({ success: true, data: { id: 1 } })).toEqual({ id: 1 })
    expect(unwrapEnvelope({ success: true, data: [1, 2], meta: { total: 2 } })).toEqual([1, 2])
  })

  it('reads `{ success, data: null }` as null — never as the envelope', () => {
    expect(unwrapEnvelope({ success: true, data: null })).toBeNull()
    expect(unwrapEnvelope({ data: null })).toBeNull()
  })

  it('keeps the chat history shape `{ data, hasMore }` working as the phone reads it', () => {
    expect(unwrapEnvelope({ data: [{ id: 'm1' }], hasMore: true })).toEqual([{ id: 'm1' }])
    // A body with other keys beside a SET data is still the older pass-through.
    expect(unwrapEnvelope({ data: [1], nextCursor: 'c' })).toEqual([1])
    // …but beside a null data, the body is not an envelope and comes back whole.
    expect(unwrapEnvelope({ data: null, nextCursor: 'c' })).toEqual({ data: null, nextCursor: 'c' })
  })

  it('passes bare answers through, and empty is null', () => {
    expect(unwrapEnvelope([1, 2])).toEqual([1, 2])
    expect(unwrapEnvelope({ id: 'x' })).toEqual({ id: 'x' })
    expect(unwrapEnvelope(undefined)).toBeNull()
    expect(unwrapEnvelope(null)).toBeNull()
  })

  it('finds meta only on an envelope', () => {
    expect(envelopeMeta({ success: true, data: [], meta: { total: 9 } })).toEqual({ total: 9 })
    expect(envelopeMeta([1])).toBeNull()
  })

  it('reads 204 and empty bodies as null', async () => {
    expect(await readBody(res(204, 'ignored'))).toBeNull()
    expect(await readBody(res(200, '  '))).toBeNull()
  })

  it('a 204 through the client resolves null', async () => {
    const { fetch } = scripted([res(204)])
    const { c } = client(fetch)
    await expect(c.post('/sync/telemetry', {})).resolves.toBeNull()
  })
})

// ── ApiError ──────────────────────────────────────────────────────────────────

describe('ApiError from gateway bodies', () => {
  it('reads GlobalExceptionFilter refusals: message, code, params', () => {
    const e = toApiError(
      { statusCode: 400, message: 'Too far to arrive', error: 'Bad Request', code: 'TOO_FAR_TO_ARRIVE', params: { distanceMetres: 812 }, timestamp: 't', path: '/x' },
      400,
    )
    expect(e).toBeInstanceOf(ApiError)
    expect(e.message).toBe('Too far to arrive')
    expect(e.status).toBe(400)
    expect(e.statusCode).toBe(400)
    expect(e.kind).toBe('http')
    expect(e.code).toBe('TOO_FAR_TO_ARRIVE')
    expect(e.params).toEqual({ distanceMetres: 812 })
    expect(e.retryable).toBe(false)
    expect(isApiError(e)).toBe(true)
  })

  it('joins a validation list and keeps each message', () => {
    const e = toApiError({ statusCode: 400, message: ['a must be set', 'b is too long'], error: 'Bad Request' }, 400)
    expect(e.message).toBe('a must be set, b is too long')
    expect(e.messages).toEqual(['a must be set', 'b is too long'])
  })

  it('reads the shared `error()` shape', () => {
    const e = toApiError({ success: false, error: { code: 'NOT_FOUND', message: 'No such task' } }, 404)
    expect(e.code).toBe('NOT_FOUND')
    expect(e.message).toBe('No such task')
  })

  it('a non-JSON body keeps the status and a generic sentence; 5xx/429 are retryable', () => {
    const e = toApiError('<html>bad gateway</html>', 502)
    expect(e.status).toBe(502)
    expect(e.retryable).toBe(true)
    expect(toApiError(null, 429).retryable).toBe(true)
    expect(isApiError(new Error('x'))).toBe(false)
  })

  it('a refusal through the client rejects with the server code', async () => {
    const { fetch } = scripted([res(409, { statusCode: 409, message: 'Taken', code: 'ROLE_TASK_TAKEN', params: { takers: ['A'] } })])
    const { c } = client(fetch)
    await expect(c.post('/tasks/t/take')).rejects.toMatchObject({ status: 409, code: 'ROLE_TASK_TAKEN', params: { takers: ['A'] }, kind: 'http' })
  })
})

// ── paths ─────────────────────────────────────────────────────────────────────

describe('path and withQuery', () => {
  it('encodes every interpolation as one segment', () => {
    expect(path`/tasks/${'../users/me'}/crew/${'join'}`).toBe('/tasks/..%2Fusers%2Fme/crew/join')
    expect(path`/documents/${'x?y#z'}`).toBe('/documents/x%3Fy%23z')
    expect(path`/n/${42}`).toBe('/n/42')
  })

  it('builds a query from defined values only, encoded', () => {
    expect(withQuery('/tasks', { a: 1, b: undefined, c: null, d: '', e: 'x y&z' })).toBe('/tasks?a=1&e=x+y%26z')
    expect(withQuery('/locations/rosters', { ids: ['a', 'b'] })).toBe('/locations/rosters?ids=a%2Cb')
    expect(withQuery('/x?summary=true', { page: 2 })).toBe('/x?summary=true&page=2')
    expect(withQuery('/x', {})).toBe('/x')
    expect(withQuery('/x')).toBe('/x')
  })

  it('refuses an absolute URL — a token is only ever sent to the API', async () => {
    const { fetch } = scripted([ok(1)])
    const { c } = client(fetch)
    await expect(c.get('https://evil.test/x')).rejects.toBeInstanceOf(TypeError)
    await expect(c.get('//evil.test/x')).rejects.toBeInstanceOf(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })
})

// ── requests ──────────────────────────────────────────────────────────────────

describe('a request', () => {
  it('sends the token, the app headers and JSON; unwraps the answer', async () => {
    const { fetch, calls } = scripted([ok({ id: 't1' })])
    const { c } = client(fetch, { headers: () => ({ 'X-Client-Platform': 'mobile', 'X-App-Version': '1.0.8' }) })
    await expect(c.patch('/tasks/t1/status', { status: 'ARRIVED' })).resolves.toEqual({ id: 't1' })
    expect(calls[0]!.url).toBe('https://api.test/api/v1/tasks/t1/status')
    expect(calls[0]!.init.method).toBe('PATCH')
    expect(calls[0]!.init.headers).toMatchObject({
      Authorization: 'Bearer tok-1',
      'Content-Type': 'application/json',
      'X-Client-Platform': 'mobile',
      'X-App-Version': '1.0.8',
    })
    expect(calls[0]!.init.body).toBe('{"status":"ARRIVED"}')
  })

  it('unwrap modes: page, raw, response', async () => {
    const body = { success: true, data: [1], meta: { total: 7 } }
    const { fetch } = scripted([res(200, body), res(200, body), res(201, body)])
    const { c } = client(fetch)
    await expect(c.page('/employees')).resolves.toEqual({ data: [1], meta: { total: 7 } })
    await expect(c.get('/employees', { unwrap: 'raw' })).resolves.toEqual(body)
    await expect(c.get('/employees', { unwrap: 'response' })).resolves.toMatchObject({ status: 201, data: [1], meta: { total: 7 }, body })
  })

  it('a FormData body goes as it is, with no JSON content type', async () => {
    const { fetch, calls } = scripted([ok({ avatarUrl: '/u/a.png' })])
    const { c } = client(fetch)
    const form = new FormData()
    form.append('file', 'x')
    await c.upload('/users/avatar/upload', form)
    expect(calls[0]!.init.body).toBe(form)
    expect(Object.keys(calls[0]!.init.headers).map((k) => k.toLowerCase())).not.toContain('content-type')
  })

  it('a 2xx that is not JSON is a parse error', async () => {
    const { fetch } = scripted([res(200, '<html>')])
    const { c } = client(fetch)
    await expect(c.get('/x')).rejects.toMatchObject({ kind: 'parse', retryable: false })
  })

  it('tells observers the status and the server clock', async () => {
    const seen: unknown[] = []
    const { fetch } = scripted([res(200, { success: true, data: 1 }, { 'X-Server-Time': '2026-10-10T08:00:00Z' })])
    const { c } = client(fetch, { observe: { response: (o) => seen.push([o.status, o.serverTime]) } })
    await c.get('/x')
    expect(seen).toEqual([[200, '2026-10-10T08:00:00Z']])
  })
})

// ── the session ───────────────────────────────────────────────────────────────

describe('401 → refresh → retry once', () => {
  it('refreshes ONCE for concurrent 401s and retries each with the new token', async () => {
    let token = 'old'
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const refresh = jest.fn(async () => {
      await gate
      token = 'new'
      return 'refreshed' as const
    })
    const fetch = jest.fn(async (_url: string, init: Call['init']) =>
      init.headers.Authorization === 'Bearer new' ? ok('fine') : res(401, { statusCode: 401, message: 'Unauthorized' }),
    )
    const { c } = client(fetch, { getToken: () => token, refresh })
    const all = Promise.all([c.get('/a'), c.get('/b'), c.post('/c', {})])
    await new Promise((r) => setTimeout(r, 0))
    release()
    await expect(all).resolves.toEqual(['fine', 'fine', 'fine'])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('`invalid` ends the session — once, with the 401 — and rejects', async () => {
    const onSessionEnded = jest.fn()
    const { fetch } = scripted([res(401, { statusCode: 401, message: 'Unauthorized' })])
    const { c } = client(fetch, { refresh: async () => 'invalid', onSessionEnded })
    await expect(c.get('/tasks')).rejects.toMatchObject({ status: 401, kind: 'http', code: 'SESSION_ENDED' })
    expect(onSessionEnded).toHaveBeenCalledTimes(1)
    expect(onSessionEnded.mock.calls[0]![0]).toBe('refresh-refused')
  })

  it('`unreachable` KEEPS the session and fails like no signal', async () => {
    const onSessionEnded = jest.fn()
    const { fetch } = scripted([res(401)])
    const { c } = client(fetch, { refresh: async () => 'unreachable', onSessionEnded })
    await expect(c.post('/attendance/clock-in', {})).rejects.toMatchObject({ status: 0, kind: 'network', code: 'SESSION_UNREACHABLE', retryable: true })
    expect(onSessionEnded).not.toHaveBeenCalled()
  })

  it('a refresh that throws counts as unreachable', async () => {
    const { fetch } = scripted([res(401)])
    const { c } = client(fetch, {
      refresh: async () => {
        throw new Error('boom')
      },
    })
    await expect(c.get('/x')).rejects.toMatchObject({ code: 'SESSION_UNREACHABLE' })
  })

  it('retries ONCE: a second 401 after a refresh is the answer', async () => {
    const refresh = jest.fn(async () => 'refreshed' as const)
    const { fetch } = scripted([res(401), res(401, { statusCode: 401, message: 'still no' })])
    const { c } = client(fetch, { refresh })
    await expect(c.get('/x')).rejects.toMatchObject({ status: 401, message: 'still no' })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('a request that carried no token does not end the session again', async () => {
    const onSessionEnded = jest.fn()
    const { fetch } = scripted([res(401)])
    const { c } = client(fetch, { getToken: () => null, refresh: async () => 'invalid', onSessionEnded })
    await expect(c.get('/x')).rejects.toMatchObject({ status: 401 })
    expect(onSessionEnded).not.toHaveBeenCalled()
  })

  it('with no refresh at all (the console), a 401 ends the session', async () => {
    const onSessionEnded = jest.fn()
    const { fetch } = scripted([res(401, { statusCode: 401, message: 'Expired' })])
    const { c } = client(fetch, { onSessionEnded })
    await expect(c.get('/platform/overview')).rejects.toMatchObject({ status: 401 })
    expect(onSessionEnded).toHaveBeenCalledWith('unauthorized', expect.any(ApiError))
  })

  it('auth:false (sign-in) sends no token and treats 401 as an answer', async () => {
    const onSessionEnded = jest.fn()
    const refresh = jest.fn()
    const { fetch, calls } = scripted([res(401, { statusCode: 401, message: 'Invalid credentials' })])
    const { c } = client(fetch, { refresh, onSessionEnded })
    await expect(c.post('/auth/login', { email: 'a', password: 'b' }, { auth: false })).rejects.toMatchObject({ message: 'Invalid credentials' })
    expect(calls[0]!.init.headers.Authorization).toBeUndefined()
    expect(refresh).not.toHaveBeenCalled()
    expect(onSessionEnded).not.toHaveBeenCalled()
  })
})

// ── retries ───────────────────────────────────────────────────────────────────

describe('retries', () => {
  it('429 on a POST is retried, honouring Retry-After (the limiter refuses before any handler runs)', async () => {
    const { fetch } = scripted([res(429, { statusCode: 429, message: 'Too Many' }, { 'Retry-After': '2' }), res(201, { success: true, data: { id: 'n' } })])
    const { c, sleeps } = client(fetch)
    await expect(c.post('/tasks', { title: 'x' })).resolves.toEqual({ id: 'n' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sleeps).toEqual([2000])
  })

  it('reads the limiter per-window header and takes the longest', async () => {
    const { fetch } = scripted([res(429, null, { 'Retry-After-short': '1', 'Retry-After-long': '5' }), ok(1)])
    const { c, sleeps } = client(fetch)
    await c.get('/x')
    expect(sleeps).toEqual([5000])
  })

  it('503 is retried for a GET, never for a POST without its Idempotency-Key', async () => {
    const get = scripted([res(503), ok('later')])
    await expect(client(get.fetch).c.get('/x')).resolves.toBe('later')
    const post = scripted([res(503), ok('never')])
    await expect(client(post.fetch).c.post('/x', {}, { idempotencyKey: false })).rejects.toMatchObject({
      status: 503,
      retryable: true,
    })
    expect(post.fetch).toHaveBeenCalledTimes(1)
  })

  it('gives up after maxRetries', async () => {
    const { fetch } = scripted([res(429)])
    const { c } = client(fetch, { retry: { maxRetries: 2 } })
    await expect(c.get('/x')).rejects.toMatchObject({ status: 429 })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('retry:false turns every retry off', async () => {
    const { fetch } = scripted([res(429)])
    const { c } = client(fetch)
    await expect(c.get('/x', { retry: false })).rejects.toMatchObject({ status: 429 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

// ── transport failures ────────────────────────────────────────────────────────

describe('network, timeout, abort', () => {
  it('nothing answered: kind network, status 0 — a GET is tried once more first', async () => {
    const networkError = jest.fn()
    const { fetch } = scripted([new TypeError('Network request failed')])
    const { c, sleeps } = client(fetch, { observe: { networkError } })
    await expect(c.get('/x')).rejects.toMatchObject({ kind: 'network', status: 0, code: 'NETWORK', retryable: true })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sleeps).toEqual([400])
    expect(networkError).toHaveBeenCalledTimes(1)
  })

  it('a blip the retry survives leaves no trace', async () => {
    const networkError = jest.fn()
    const { fetch } = scripted([new TypeError('stale pool'), ok('ok')])
    const { c } = client(fetch, { observe: { networkError } })
    await expect(c.get('/x')).resolves.toBe('ok')
    expect(networkError).not.toHaveBeenCalled()
  })

  it('a write without its Idempotency-Key is never sent twice on a guess', async () => {
    const { fetch } = scripted([new TypeError('offline')])
    const { c } = client(fetch)
    await expect(c.post('/x', {}, { idempotencyKey: false })).rejects.toMatchObject({ kind: 'network' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('no answer in time: kind timeout, status 0', async () => {
    const { fetch } = scripted([() => new Promise<ResponseLike>(() => undefined)])
    const { c } = client(fetch, { timeoutMs: 15 })
    await expect(c.get('/slow')).rejects.toMatchObject({ kind: 'timeout', status: 0, code: 'TIMEOUT' })
  })

  it('the caller cancelling is kind aborted', async () => {
    const ctrl = new AbortController()
    const { fetch } = scripted([() => new Promise<ResponseLike>(() => undefined)])
    const { c } = client(fetch)
    const p = c.get('/search', { signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ kind: 'aborted', status: 0 })
  })

  it('uses the app’s own (translated) sentences', async () => {
    const { fetch } = scripted([new TypeError('x')])
    const { c } = client(fetch, { messages: { network: () => 'Sie sind offline.' }, retry: { networkRetries: 0 } })
    await expect(c.get('/x')).rejects.toMatchObject({ message: 'Sie sind offline.' })
  })
})

// ── GET merging and the response cache ────────────────────────────────────────

describe('GET de-duplication', () => {
  it('merges identical GETs in flight for ONE session', async () => {
    let session = 'u1'
    const { fetch } = scripted([() => new Promise<ResponseLike>((r) => setTimeout(() => r(ok('s')), 5))])
    const { c } = client(fetch, { dedupeGets: true, sessionKey: () => session })
    const a = c.get('/attendance/status')
    const b = c.get('/attendance/status')
    session = 'u2'
    const other = c.get('/attendance/status')
    await Promise.all([a, b, other])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('clearInflight forgets a merged GET (sign-out)', async () => {
    const { fetch } = scripted([() => new Promise<ResponseLike>((r) => setTimeout(() => r(ok('s')), 5))])
    const { c } = client(fetch, { dedupeGets: true, sessionKey: () => 'u1' })
    const a = c.get('/x')
    c.clearInflight()
    const b = c.get('/x')
    await Promise.all([a, b])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('never merges writes', async () => {
    const { fetch } = scripted([ok(1)])
    const { c } = client(fetch, { dedupeGets: true })
    await Promise.all([c.post('/x', {}), c.post('/x', {})])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('response cache hooks', () => {
  it('writes every answered GET, with the endpoint verdict and whose it is', async () => {
    const write = jest.fn()
    const { fetch } = scripted([ok({ id: 'e1' })])
    const { c } = client(fetch, { sessionKey: () => 'u1', cache: { read: jest.fn(), write } })
    await c.call(apiEndpoints.calendar.event, { id: 'e1' })
    expect(write).toHaveBeenCalledWith({ method: 'GET', path: '/calendar/events/e1', keep: true, sessionKey: 'u1' }, { id: 'e1' })
  })

  it('answers from the cache only when NOTHING answered', async () => {
    const read = jest.fn(async () => ({ kept: true }))
    const { fetch } = scripted([new TypeError('offline')])
    const { c } = client(fetch, { cache: { read, write: jest.fn() } })
    await expect(c.get('/documents')).resolves.toEqual({ kept: true })
  })

  it('never masks a refusal from the server', async () => {
    const read = jest.fn(async () => ({ kept: true }))
    const { fetch } = scripted([res(403, { statusCode: 403, message: 'No' })])
    const { c } = client(fetch, { cache: { read, write: jest.fn() } })
    await expect(c.get('/documents')).rejects.toMatchObject({ status: 403 })
    expect(read).not.toHaveBeenCalled()
  })

  it('a failing cache never fails the request', async () => {
    const { fetch } = scripted([ok(1)])
    const { c } = client(fetch, {
      cache: {
        read: () => undefined,
        write: () => {
          throw new Error('disk full')
        },
      },
    })
    await expect(c.get('/x')).resolves.toBe(1)
  })
})

// ── endpoints, query keys, toResult ───────────────────────────────────────────

describe('endpoint calls', () => {
  it('a public endpoint sends no token', async () => {
    const { fetch, calls } = scripted([ok({ valid: true })])
    const { c } = client(fetch)
    await c.call(apiEndpoints.invitations.validate, { code: 'AB/CD' })
    expect(calls[0]!.url).toBe('https://api.test/api/v1/invitations/validate/AB%2FCD')
    expect(calls[0]!.init.headers.Authorization).toBeUndefined()
  })

  it('a per-call keep verdict: presence is never kept', async () => {
    const write = jest.fn()
    const { fetch } = scripted([ok([]), ok([])])
    const { c } = client(fetch, { cache: { read: jest.fn(), write } })
    await c.call(apiEndpoints.attendance.allEntries, { status: 'CLOCKED_IN' })
    await c.call(apiEndpoints.attendance.allEntries, { date: '2026-10-10' })
    expect(write.mock.calls.map((x) => x[0].keep)).toEqual([false, true])
  })

  it('infers args, body and result from the definition alone', async () => {
    const { fetch } = scripted([ok({ total: 3 }), ok({ id: 't' })])
    const { c } = client(fetch)
    // No arguments needed for an endpoint whose args are optional / void.
    const counts: Record<string, number> = await c.call(apiEndpoints.tasks.counts)
    expect(counts).toEqual({ total: 3 })
    const crew = await c.call(apiEndpoints.tasks.changeLead, { id: 't' }, { body: { toUserId: 'u', scope: 'TODAY' } })
    expect(crew).toEqual({ id: 't' })
    // @ts-expect-error — an action the gateway does not serve is refused at compile time
    void (() => c.call(apiEndpoints.tasks.crew, { id: 't', action: 'dance' }))
  })

  it('the body travels in the options, typed by the endpoint', async () => {
    const { fetch, calls } = scripted([ok({ id: 't' })])
    const { c } = client(fetch)
    await c.call(apiEndpoints.tasks.crew, { id: 't 1', action: 'join' }, { body: { viaLeaderStart: true } })
    expect(calls[0]!.url).toBe('https://api.test/api/v1/tasks/t%201/crew/join')
    expect(calls[0]!.init.method).toBe('POST')
    expect(calls[0]!.init.body).toBe('{"viaLeaderStart":true}')
  })
})

describe('query keys', () => {
  it('derive from the endpoint name, with stable argument order', () => {
    const a = queryKey(apiEndpoints.tasks.list, { status: 'NEW', page: 1, search: undefined })
    const b = queryKey(apiEndpoints.tasks.list, { page: 1, status: 'NEW' })
    expect(a).toEqual(b)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a).toEqual(['tasks', 'list', { page: 1, status: 'NEW' }])
    expect(queryKey(apiEndpoints.tasks.counts)).toEqual(['tasks', 'counts'])
    expect(queryKey('tasks.get', { id: 'x' })).toEqual(['tasks', 'get', { id: 'x' }])
  })

  it('sort nested objects and keep array order', () => {
    expect(queryKey('a.b', { z: { y: 1, x: [2, 1] }, d: new Date('2026-01-01T00:00:00Z') })).toEqual([
      'a',
      'b',
      { d: '2026-01-01T00:00:00.000Z', z: { x: [2, 1], y: 1 } },
    ])
  })

  it('refuse an endpoint that was never named', () => {
    expect(() => queryKey(endpoint({ method: 'GET', path: () => '/x' }))).toThrow(/defineEndpoints/)
  })

  it('defineEndpoints refuses one endpoint under two names', () => {
    const shared = endpoint({ method: 'GET', path: () => '/x' })
    defineEndpoints('one', { shared })
    expect(() => defineEndpoints('two', { shared })).toThrow(/defined twice/)
  })
})

describe('toResult (the web’s non-throwing shape)', () => {
  it('success, failure and the real status', async () => {
    expect(await toResult(Promise.resolve({ id: 1 }))).toEqual({ status: 200, data: { id: 1 } })
    expect(await toResult(Promise.reject(toApiError({ message: 'No', code: 'C', params: { n: 1 } }, 403)))).toEqual({
      status: 403,
      error: 'No',
      errorCode: 'C',
      errorParams: { n: 1 },
    })
    const { fetch } = scripted([res(201, { success: true, data: { id: 'x' } })])
    const { c } = client(fetch)
    expect(await toResult(c.post('/tasks', {}, { unwrap: 'response' }))).toEqual({ status: 201, data: { id: 'x' } })
    const net = scripted([new TypeError('x')])
    expect(await toResult(client(net.fetch).c.post('/x'))).toMatchObject({ status: 0, errorCode: 'NETWORK' })
  })
})
