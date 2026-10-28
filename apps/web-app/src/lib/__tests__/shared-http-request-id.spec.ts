/**
 * A write sent twice happens once — the client's half (packages/shared/src/http/core/client/request-id.ts).
 * The server's half (one key, one execution) is the gateway's idempotency interceptor and its spec.
 */
import { createApiClient, type ApiClientConfig, type ResponseLike } from '@hbcfield/shared/client'

function res(status: number, body?: unknown): ResponseLike {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null, forEach: () => undefined },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  }
}

type Init = { method: string; headers: Record<string, string>; body?: unknown }

function scripted(answers: Array<ResponseLike | Error>) {
  const calls: Init[] = []
  let i = 0
  const fetch = jest.fn(async (_url: string, init: Init) => {
    calls.push(init)
    const a = answers[Math.min(i++, answers.length - 1)]
    if (a instanceof Error) throw a
    return a
  })
  return { fetch, calls }
}

let n = 0
function client(fetch: ApiClientConfig['fetch'], extra: Partial<ApiClientConfig> = {}) {
  return createApiClient({
    baseUrl: () => 'https://api.test/api/v1',
    getToken: () => 'tok-1',
    sessionKey: () => 'user-1',
    fetch,
    sleep: async () => undefined,
    random: () => 0.5,
    requestId: () => `key-${String(++n).padStart(16, '0')}`,
    ...extra,
  })
}

const key = (init: Init) => init.headers['Idempotency-Key']
const ok = res(201, { data: { id: 'job-1' } })

describe('every signed-in write carries an Idempotency-Key', () => {
  it('POST, PUT, PATCH and DELETE each get their own; GET and sign-in get none', async () => {
    const { fetch, calls } = scripted([res(200, { data: {} })])
    const c = client(fetch)
    await c.post('/tasks', { title: 'a' })
    await c.put('/x', {})
    await c.patch('/x', {})
    await c.delete('/x')
    await c.get('/tasks')
    await c.post('/auth/login', { email: 'a' }, { auth: false })
    const keys = calls.map(key)
    expect(keys.slice(0, 4).every((k) => /^[A-Za-z0-9_-]{16,128}$/.test(k))).toBe(true)
    expect(new Set(keys.slice(0, 4)).size).toBe(4)
    expect(keys[4]).toBeUndefined()
    expect(keys[5]).toBeUndefined()
  })

  it('a key the caller gives is kept, and `false` sends none', async () => {
    const { fetch, calls } = scripted([ok])
    const c = client(fetch)
    await c.post('/a', {}, { idempotencyKey: 'mine-0000000000000001' })
    await c.post('/a', {}, { headers: { 'idempotency-key': 'header-00000000000001' } })
    await c.post('/a', {}, { idempotencyKey: false })
    expect(calls.map((i) => i.headers['Idempotency-Key'] ?? i.headers['idempotency-key'])).toEqual([
      'mine-0000000000000001',
      'header-00000000000001',
      undefined,
    ])
  })

  it('the default key comes from the secure random source, 32 URL-safe characters', async () => {
    const { fetch, calls } = scripted([ok])
    await client(fetch, { requestId: undefined }).post('/a', {})
    expect(key(calls[0])).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })
})

describe('the connection drops: sent again under the SAME key', () => {
  it('no answer at all → one more try by itself, same key, and the person sees the result', async () => {
    const { fetch, calls } = scripted([new TypeError('Failed to fetch'), ok])
    const out = await client(fetch).post('/tasks', { title: 'Boiler' })
    expect(out).toEqual({ id: 'job-1' })
    expect(calls).toHaveLength(2)
    expect(key(calls[1])).toBe(key(calls[0]))
  })

  it('a proxy timeout (504) or the gateway\'s 408 → asked again with the same key', async () => {
    for (const status of [408, 502, 503, 504]) {
      const { fetch, calls } = scripted([res(status), ok])
      await client(fetch).post('/tasks', { title: 'x' })
      expect(calls).toHaveLength(2)
      expect(key(calls[1])).toBe(key(calls[0]))
    }
  })

  it('a refusal (400/409/422) is an answer: never sent again', async () => {
    for (const status of [400, 409, 422]) {
      const { fetch, calls } = scripted([res(status, { message: 'no' }), ok])
      await expect(client(fetch).post('/tasks', {})).rejects.toMatchObject({ status })
      expect(calls).toHaveLength(1)
    }
  })

  it('a 401 → refresh → the same write again, same key', async () => {
    const { fetch, calls } = scripted([res(401), ok])
    await client(fetch, { refresh: async () => 'refreshed' }).post('/tasks', {})
    expect(calls).toHaveLength(2)
    expect(key(calls[1])).toBe(key(calls[0]))
  })
})

describe('the person taps again after "no connection"', () => {
  it('the same action with the same body reuses the key — the server answers the first one', async () => {
    const { fetch, calls } = scripted([new TypeError('x'), new TypeError('x'), ok])
    const c = client(fetch)
    await expect(c.post('/tasks', { title: 'Boiler', b: 1 })).rejects.toMatchObject({ kind: 'network' })
    await c.post('/tasks', { b: 1, title: 'Boiler' }) // same body, other key order
    expect(new Set(calls.map(key)).size).toBe(1)
  })

  it('a timeout counts the same (the server may have done it)', async () => {
    const { fetch, calls } = scripted([res(504), res(504), res(504), ok])
    const c = client(fetch)
    await expect(c.post('/tasks', { t: 1 })).rejects.toMatchObject({ status: 504 })
    await c.post('/tasks', { t: 1 })
    expect(new Set(calls.map(key)).size).toBe(1)
  })

  it('after a real answer, the same body again is a NEW action (a second comment "ok" is allowed)', async () => {
    const { fetch, calls } = scripted([ok])
    const c = client(fetch)
    await c.post('/tasks/1/comments', { content: 'ok' })
    await c.post('/tasks/1/comments', { content: 'ok' })
    expect(key(calls[1])).not.toBe(key(calls[0]))
  })

  it('a different body, path or person never reuses it', async () => {
    let who = 'user-1'
    const { fetch, calls } = scripted([new TypeError('x'), new TypeError('x'), ok])
    const c = client(fetch, { sessionKey: () => who })
    await expect(c.post('/tasks', { t: 1 })).rejects.toBeDefined()
    await c.post('/tasks', { t: 2 })
    await c.post('/other', { t: 1 })
    who = 'user-2'
    await c.post('/tasks', { t: 1 })
    expect(new Set(calls.map(key)).size).toBe(4)
  })

  it('signing out forgets every kept key', async () => {
    const { fetch, calls } = scripted([new TypeError('x'), new TypeError('x'), ok])
    const c = client(fetch)
    await expect(c.post('/tasks', { t: 1 })).rejects.toBeDefined()
    c.clearInflight()
    await c.post('/tasks', { t: 1 })
    expect(key(calls[2])).not.toBe(key(calls[0]))
  })
})
