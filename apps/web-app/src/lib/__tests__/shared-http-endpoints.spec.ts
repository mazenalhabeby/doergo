/**
 * The shared endpoint table (packages/shared/src/http/endpoints): every path
 * builder encodes what it is given, every endpoint has a unique name, and
 * nothing in the table is an absolute URL.
 */
import { apiEndpoints, queryKey } from '@hbcfield/shared/client'

/** What a deep link, a push payload or a server answer could put in an id. */
const HOSTILE = '../x?y=1#z&w'

/**
 * Arguments that answer EVERY property with the hostile value — as a one-item
 * array, so a builder that joins a list (`ids.join(',')`) and one that
 * interpolates a string both receive it. `ownKeys` names one extra key, so a
 * builder that spreads the rest of its arguments into a query string gets a
 * hostile query value too.
 */
const hostileArgs = new Proxy(
  {},
  {
    get: (_t, k) => (typeof k === 'string' ? [HOSTILE] : undefined),
    ownKeys: () => ['extra'],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true, value: [HOSTILE] }),
  },
)

const all = Object.entries(apiEndpoints).flatMap(([domain, defs]) =>
  Object.entries(defs).map(([key, def]) => ({ domain, key, def })),
)

describe('the endpoint table', () => {
  it('is not empty', () => {
    expect(all.length).toBeGreaterThan(300)
  })

  it.each(all.map((e) => [e.def.name, e]))('%s encodes its parameters', (_name, { def }) => {
    const built = def.path(hostileArgs as never)
    expect(built.startsWith('/')).toBe(true)
    expect(built.startsWith('//')).toBe(false)
    // The raw value never survives: not as a path traversal, a query, nor a fragment.
    expect(built).not.toContain('../x')
    expect(built).not.toContain('#')
    expect(built).not.toContain('y=1')
    expect(built).not.toContain('&w')
    // At most one `?` — the query the builder meant to start.
    expect((built.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1)
  })

  it('names every endpoint `domain.key`, uniquely', () => {
    const names = all.map((e) => e.def.name)
    expect(new Set(names).size).toBe(names.length)
    for (const { key, def } of all) {
      expect(def.name).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/)
      expect(def.name.endsWith(`.${key}`)).toBe(true)
      expect(queryKey(def).slice(0, 2)).toEqual(def.name.split('.'))
    }
  })

  it('keeps nothing that mints a link or reads presence', () => {
    for (const { def } of all) {
      if (def.method !== 'GET') continue
      const sample = def.path(hostileArgs as never)
      if (/presign|download|url\b|\/sync\/|\/tracking\//i.test(sample)) {
        const keep = typeof def.keep === 'function' ? def.keep(hostileArgs as never) : def.keep
        expect({ name: def.name, keep }).toEqual({ name: def.name, keep: keep === true ? 'never' : keep })
      }
    }
  })

  it('marks only sign-in style routes public', () => {
    const publicNames = all.filter((e) => e.def.public).map((e) => e.def.name).sort()
    expect(publicNames).toEqual(
      [
        // The phone's update gate, asked before sign-in.
        'app.version',
        'auth.biometricChallenge',
        'auth.biometricVerify',
        'auth.forgotPassword',
        'auth.login',
        'auth.refresh',
        'auth.register',
        'auth.resetPassword',
        // The public blog, read by the web's server render.
        'blog.post',
        'blog.posts',
        'invitations.accept',
        'invitations.validate',
        'signLink.file',
        'signLink.open',
        'signLink.resend',
        'signLink.submit',
      ].sort(),
    )
  })
})
